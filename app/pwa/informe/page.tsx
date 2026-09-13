'use client';

import { useCallback, useEffect, useState } from 'react';
import { BUILDING_ID } from '@/ui/SesionProvider';
import { MutationError, mutate, readCached } from '@/pwa/sync';
import { Esqueleto, ErrorDeRed, LeyendaCumplimiento } from '@/ui/estados';
import { Campo, Resultado, useEnvio } from '@/ui/formulario';
import { formatDate, formatMoney, formatPct } from '@/shared/format';
import type { MonthlyReportContent } from '@/db/schema/logbook';

type Vista = {
  period: string; periodLabel: string; content: MonthlyReportContent;
  narrative: string | null; controlJustification: string | null;
  status: 'draft' | 'submitted'; version: number;
  canSubmit: boolean; submitAvailableFrom: string;
};

/** ESPEC §4.7 — Mi informe. Vista previa en construcción del mes en curso. */
export default function MiInforme() {
  const [vista, setVista] = useState<Vista | null>(null);
  const [error, setError] = useState(false);
  const [narrativa, setNarrativa] = useState('');
  const [justificacion, setJustificacion] = useState('');
  const { enviando, setEnviando, estado, setEstado } = useEnvio();

  const cargar = useCallback(async () => {
    try {
      const mes = new Date().toISOString().slice(0, 7);
      const r = await readCached<Vista>(BUILDING_ID, `/reports/monthly/${mes}`);
      setVista(r.data);
      setNarrativa(r.data.narrative ?? '');
      setJustificacion(r.data.controlJustification ?? '');
      setError(false);
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => { void cargar(); }, [cargar]);

  async function guardar() {
    if (!vista) return;
    setEnviando(true);
    try {
      const r = await mutate(BUILDING_ID, `/reports/monthly/${vista.period.slice(0, 7)}`,
        { narrative: narrativa, controlJustification: justificacion },
        { method: 'PATCH', label: `Informe ${vista.periodLabel}` });
      setEstado(r.queued
        ? { tipo: 'encolado', mensaje: 'Se guardará al recuperar señal.' }
        : { tipo: 'ok', mensaje: 'Borrador guardado.' });
    } catch (err) {
      setEstado({ tipo: 'error', mensaje: err instanceof MutationError ? err.message : 'No pudimos guardar el borrador.' });
    } finally {
      setEnviando(false);
    }
  }

  async function enviar() {
    if (!vista) return;
    setEnviando(true);
    try {
      await mutate(BUILDING_ID, `/reports/monthly/${vista.period.slice(0, 7)}/submit`,
        { narrative: narrativa, controlJustification: justificacion },
        { label: `Enviar informe ${vista.periodLabel}` });
      setEstado({ tipo: 'ok', mensaje: 'Informe enviado al Administrador.' });
      await cargar();
    } catch (err) {
      setEstado({ tipo: 'error', mensaje: err instanceof MutationError ? err.message : 'No pudimos enviar el informe.' });
    } finally {
      setEnviando(false);
    }
  }

  if (!vista && error) return <ErrorDeRed onReintentar={() => void cargar()} />;
  if (!vista) return <Esqueleto filas={8} />;

  const c = vista.content;

  return (
    <>
      <h1>Informe de {vista.periodLabel}</h1>
      {vista.status === 'submitted' ? (
        <div className="aviso verde"><strong>Enviado</strong>Versión {vista.version}. Para corregirlo hay que generar una versión nueva.</div>
      ) : (
        <p style={{ color: 'var(--texto-suave)' }}>Borrador en construcción con lo registrado hasta ahora.</p>
      )}

      <Resultado estado={estado} />

      {/* RN-50 — Resumen de control del mes */}
      <section className="tarjeta">
        <h2>Resumen de control</h2>
        <div className="grilla" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))' }}>
          <Dato rotulo="Previstas" valor={c.control.planned} />
          <Dato rotulo="Completadas" valor={c.control.completed} />
          <Dato rotulo="Pendientes" valor={c.control.pending} />
          <Dato rotulo="Cumplimiento" valor={formatPct(c.control.compliancePct)} />
        </div>
        {vista.status !== 'submitted' ? (
          <Campo label="Justificación de lo pendiente" htmlFor="justificacion"
            ayuda="Contá por qué quedaron pendientes. Esto va tal cual al informe.">
            <textarea id="justificacion" value={justificacion} onChange={(e) => setJustificacion(e.target.value)} />
          </Campo>
        ) : justificacion ? <p style={{ marginTop: '.85rem' }}>{justificacion}</p> : null}
      </section>

      <section className="tarjeta">
        <h2>Lo que pasó este mes</h2>
        <dl style={{ margin: 0 }}>
          <Linea t="Reclamos abiertos" v={c.tickets.opened} />
          <Linea t="Reclamos cerrados" v={c.tickets.closed} />
          <Linea t="Mantenimiento hecho" v={`${c.maintenance.done} de ${c.maintenance.planned}`} />
          <Linea t="Tareas aprobadas" v={c.approvedTasks.total} />
          <Linea t="Derivaciones a técnico" v={formatPct(c.approvedTasks.escalationPct)} />
          <Linea t="Incidentes" v={c.incidents.total} />
          <Linea t="Gasto del mes" v={formatMoney(c.spend.total, c.spend.currency)} />
        </dl>
      </section>

      {/* RN-43: presente-fuera-de-rango y faltante son cosas distintas */}
      <section className="tarjeta">
        <h2>Piscina</h2>
        <dl style={{ margin: 0 }}>
          <Linea t="Mediciones registradas" v={`${c.pool.logged} de ${c.pool.expected} esperadas`} />
          <Linea t="Fuera de rango" v={c.pool.outOfRange} />
          <Linea t="Días sin registro" v={c.pool.missing} />
        </dl>
      </section>

      {c.stock.belowMinimum.length > 0 ? (
        <section className="tarjeta">
          <h2>Insumos por reponer</h2>
          <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
            {c.stock.belowMinimum.map((s) => <li key={s}>{s}</li>)}
          </ul>
        </section>
      ) : null}

      {/* CB-10: los bloques sin datos se declaran explícitamente */}
      {c.emptyBlocks.length > 0 ? (
        <div className="aviso info">
          <strong>Bloques sin datos este mes</strong>
          {c.emptyBlocks.join(' · ')}
        </div>
      ) : null}

      {vista.status !== 'submitted' ? (
        <section className="tarjeta">
          <h2>Recomendaciones y observaciones</h2>
          <Campo label="Tu texto" htmlFor="narrativa" ayuda="Lo que quieras dejar dicho para la Administración.">
            <textarea id="narrativa" value={narrativa} rows={6} onChange={(e) => setNarrativa(e.target.value)} />
          </Campo>
          <div className="fila">
            <button className="boton secundario" type="button" onClick={() => void guardar()} disabled={enviando}>
              Guardar borrador
            </button>
            {/* RN-41: habilitado solo desde el día 1 del mes siguiente */}
            <button className="boton" type="button" onClick={() => void enviar()} disabled={enviando || !vista.canSubmit}>
              Enviar al Administrador
            </button>
          </div>
          {!vista.canSubmit ? (
            <p className="ayuda">
              Vas a poder enviarlo a partir del {formatDate(vista.submitAvailableFrom)}, cuando el mes haya cerrado.
            </p>
          ) : null}
        </section>
      ) : narrativa ? (
        <section className="tarjeta">
          <h2>Recomendaciones y observaciones</h2>
          <p style={{ whiteSpace: 'pre-wrap' }}>{narrativa}</p>
        </section>
      ) : null}

      <LeyendaCumplimiento texto="Estos indicadores miden el cumplimiento del plan operativo del edificio, no el desempeño de una persona. Su uso con fines disciplinarios requiere el procedimiento previsto en el régimen de faltas y sanciones." />
    </>
  );
}

function Dato({ rotulo, valor }: { rotulo: string; valor: string | number }) {
  return (
    <div className="indicador" style={{ cursor: 'default' }}>
      <span className="valor">{valor}</span>
      <span className="rotulo">{rotulo}</span>
    </div>
  );
}

function Linea({ t, v }: { t: string; v: string | number }) {
  return (
    <div className="entre" style={{ padding: '.4rem 0', borderBottom: '1px solid var(--borde)' }}>
      <dt style={{ color: 'var(--texto-suave)' }}>{t}</dt>
      <dd style={{ margin: 0, fontWeight: 650 }}>{v}</dd>
    </div>
  );
}

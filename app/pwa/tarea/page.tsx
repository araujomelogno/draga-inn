'use client';

import { useState } from 'react';
import { BUILDING_ID, useSesion } from '@/ui/SesionProvider';
import { Campo, Resultado, useEnvio } from '@/ui/formulario';
import { MutationError, mutate } from '@/pwa/sync';
import { TRADE_LABELS } from '@/shared/schemas';
import { localDate } from '@/shared/dates';

const RUBROS = Object.entries(TRADE_LABELS) as [keyof typeof TRADE_LABELS, string][];

/** ESPEC §4.4 — Tarea aprobada (Anexo B). */
export default function TareaAprobada() {
  const { perfil } = useSesion();
  const hoy = localDate(new Date(), perfil?.timezone ?? 'America/Montevideo');

  const [fecha, setFecha] = useState(hoy);
  const [rubro, setRubro] = useState<keyof typeof TRADE_LABELS>('other');
  const [descripcion, setDescripcion] = useState('');
  const [materiales, setMateriales] = useState('');
  const [minutos, setMinutos] = useState('');
  const [derivada, setDerivada] = useState(false);
  const [motivoDerivacion, setMotivoDerivacion] = useState('');
  const [crearTicket, setCrearTicket] = useState(true);
  const [costo, setCosto] = useState('');
  const { enviando, setEnviando, estado, setEstado, errores, setErrores } = useEnvio();

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setErrores({});
    setEstado(null);

    const errs: Record<string, string> = {};
    if (descripcion.trim().length < 10) errs.description = 'Contá qué hiciste con al menos 10 caracteres.';
    // RN-23
    if (derivada && motivoDerivacion.trim().length < 5) errs.escalationReason = 'Contá por qué hizo falta derivar a un técnico.';
    if (Object.keys(errs).length > 0) { setErrores(errs); return; }

    setEnviando(true);
    try {
      const res = await mutate<{ ticketId: string | null }>(
        BUILDING_ID,
        '/approved-tasks',
        {
          performedOn: fecha,
          trade: rubro,
          description: descripcion.trim(),
          materials: materiales || null,
          timeSpentMinutes: minutos ? Number(minutos) : null,
          escalated: derivada,
          escalationReason: derivada ? motivoDerivacion : null,
          createEscalationTicket: derivada && crearTicket,
          costAmount: costo ? costo.replace(',', '.') : null,
        },
        { label: `Tarea aprobada: ${TRADE_LABELS[rubro]}` },
      );

      setEstado(
        res.queued
          ? { tipo: 'encolado', mensaje: 'Se enviará al recuperar señal.' }
          : { tipo: 'ok', mensaje: 'Tarea registrada.', detalle: res.data?.ticketId ? 'Se creó el ticket de derivación vinculado.' : undefined },
      );
      setDescripcion(''); setMateriales(''); setMinutos(''); setDerivada(false); setMotivoDerivacion(''); setCosto('');
    } catch (err) {
      setEstado({ tipo: 'error', mensaje: err instanceof MutationError ? err.message : 'No pudimos guardar la tarea.' });
    } finally {
      setEnviando(false);
    }
  }

  return (
    <>
      <h1>Tarea aprobada</h1>
      <p style={{ color: 'var(--texto-suave)' }}>Anexo B del Manual</p>
      <Resultado estado={estado} />

      <form className="tarjeta" onSubmit={enviar} noValidate>
        <Campo label="Fecha" htmlFor="fecha">
          <input id="fecha" type="date" value={fecha} max={hoy} onChange={(e) => setFecha(e.target.value)} />
        </Campo>

        <Campo label="Rubro" htmlFor="rubro">
          <select id="rubro" value={rubro} onChange={(e) => setRubro(e.target.value as keyof typeof TRADE_LABELS)}>
            {RUBROS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </Campo>

        <Campo label="¿Qué hiciste? *" htmlFor="descripcion" error={errores.description}>
          <textarea id="descripcion" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
        </Campo>

        <Campo label="Materiales usados" htmlFor="materiales">
          <input id="materiales" type="text" value={materiales} onChange={(e) => setMateriales(e.target.value)} />
        </Campo>

        <Campo label="Tiempo (minutos)" htmlFor="minutos">
          <input id="minutos" type="number" inputMode="numeric" min={0} max={1440} value={minutos} onChange={(e) => setMinutos(e.target.value)} />
        </Campo>

        {/* El costo solo aparece si la administración lo habilitó */}
        {perfil ? (
          <Campo label="Costo (opcional)" htmlFor="costo" ayuda="Si hubo gasto, anotalo acá para que quede en el expediente.">
            <input id="costo" type="text" inputMode="decimal" value={costo} onChange={(e) => setCosto(e.target.value)} />
          </Campo>
        ) : null}

        <div className="campo">
          <label style={{ display: 'flex', gap: '.6rem', alignItems: 'center', minHeight: 44, fontWeight: 600 }}>
            <input type="checkbox" checked={derivada} onChange={(e) => setDerivada(e.target.checked)}
              style={{ width: 24, height: 24, minHeight: 24 }} />
            ¿Requirió derivación a técnico?
          </label>
        </div>

        {/* RN-23: al marcar derivación se ofrece crear el ticket en el mismo paso */}
        {derivada ? (
          <>
            <Campo label="Motivo de la derivación *" htmlFor="motivo" error={errores.escalationReason}>
              <textarea id="motivo" value={motivoDerivacion} onChange={(e) => setMotivoDerivacion(e.target.value)} />
            </Campo>
            <div className="aviso info">
              <label style={{ display: 'flex', gap: '.6rem', alignItems: 'center', minHeight: 44 }}>
                <input type="checkbox" checked={crearTicket} onChange={(e) => setCrearTicket(e.target.checked)}
                  style={{ width: 24, height: 24, minHeight: 24 }} />
                Crear un ticket vinculado para seguirle el rastro
              </label>
            </div>
          </>
        ) : null}

        <button className="boton ancho grande" type="submit" disabled={enviando}>
          {enviando ? 'Guardando…' : 'Guardar tarea'}
        </button>
      </form>
    </>
  );
}

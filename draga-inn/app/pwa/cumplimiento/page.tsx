'use client';

import { useCallback, useEffect, useState } from 'react';
import { BUILDING_ID } from '@/ui/SesionProvider';
import { readCached } from '@/pwa/sync';
import { Esqueleto, ErrorDeRed, LeyendaCumplimiento } from '@/ui/estados';
import { formatDate, formatPct, pluralize } from '@/shared/format';

type MiCumplimiento = {
  framing: { title: string; legend: string };
  today: string;
  season: { isHigh: boolean; label: string; reason?: string };
  periods: { day: number; week: number; month: number };
  streak: { complete: number; missing: number };
  calendar: { date: string; status: 'complete' | 'partial' | 'missing'; computed: boolean; compliancePct: number; poolLogged: boolean | null; poolOutOfRange: boolean | null }[];
  pending: { date: string; missing: string[]; compliancePct: number; dayStatus: string };
  trends: { param: string; label: string; direction: 'up' | 'down'; values: number[]; unit: string }[];
};

/**
 * ESPEC §4.8 — «Cumplimiento del plan del edificio».
 *
 * RN-49: el encargado entra sin permiso de nadie y ve EXACTAMENTE el mismo
 * detalle que la administración.
 * RN-51: el título es el del plan del edificio, nunca «tu desempeño», y la
 * leyenda sobre uso disciplinario va al pie.
 */
export default function MiCumplimiento() {
  const [datos, setDatos] = useState<MiCumplimiento | null>(null);
  const [error, setError] = useState(false);

  const cargar = useCallback(async () => {
    try {
      const r = await readCached<MiCumplimiento>(BUILDING_ID, '/compliance/me');
      setDatos(r.data);
      setError(false);
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => { void cargar(); }, [cargar]);

  if (!datos && error) return <ErrorDeRed onReintentar={() => void cargar()} />;
  if (!datos) return <Esqueleto filas={8} />;

  return (
    <>
      {/* RN-51: el encuadre es el título de la pantalla. */}
      <h1>{datos.framing.title}</h1>
      <p style={{ color: 'var(--texto-suave)' }}>
        {formatDate(datos.today)} · {datos.season.label}
      </p>

      <section className="tarjeta">
        <div className="grilla" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
          <Periodo rotulo="Hoy" valor={datos.periods.day} />
          <Periodo rotulo="Esta semana" valor={datos.periods.week} />
          <Periodo rotulo="Este mes" valor={datos.periods.month} />
        </div>
      </section>

      <section className="tarjeta">
        <h2>Racha</h2>
        {datos.streak.missing > 0 ? (
          <p className="aviso ambar" style={{ marginBottom: 0 }}>
            {pluralize(datos.streak.missing, 'día seguido sin registro', 'días seguidos sin registro')}.
          </p>
        ) : (
          <p style={{ marginBottom: 0 }}>
            {pluralize(datos.streak.complete, 'día seguido', 'días seguidos')} con el plan completo.
          </p>
        )}
      </section>

      {/* Pendientes de hoy, con acceso directo para completarlos */}
      {datos.pending.missing.length > 0 ? (
        <section className="tarjeta">
          <h2>Te falta hoy</h2>
          <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
            {datos.pending.missing.slice(0, 12).map((m) => <li key={m}>{m}</li>)}
          </ul>
          {datos.pending.missing.length > 12 ? (
            <p style={{ color: 'var(--texto-suave)', fontSize: '.86rem' }}>y {datos.pending.missing.length - 12} más.</p>
          ) : null}
          <a className="boton ancho" href="/pwa" style={{ marginTop: '.75rem' }}>Ir a completarlos</a>
        </section>
      ) : (
        <section className="tarjeta">
          <h2>Te falta hoy</h2>
          <p style={{ marginBottom: 0 }}>Nada: el plan del día está completo.</p>
        </section>
      )}

      {/* RN-47 — aviso de tendencia aunque los valores estén dentro de rango */}
      {datos.trends.length > 0 ? (
        <section className="tarjeta">
          <h2>Tendencia de la piscina</h2>
          {datos.trends.map((t) => (
            <div key={t.param} className="aviso ambar">
              <strong>{t.label} viene {t.direction === 'up' ? 'subiendo' : 'bajando'}</strong>
              Últimas tres mediciones: {t.values.join(' → ')} {t.unit}. Todavía puede estar dentro de rango, pero conviene corregir antes.
            </div>
          ))}
        </section>
      ) : null}

      {/* Calendario de 30 días. RN-43: sin computar ≠ faltante. */}
      <section className="tarjeta">
        <h2>Últimos 30 días</h2>
        <div className="calendario">
          {datos.calendar.map((d) => (
            <span
              key={d.date}
              className={`dia ${d.computed ? d.status : 'sin-computar'}`}
              title={`${formatDate(d.date)} — ${d.computed ? `${formatPct(d.compliancePct)} del plan` : 'sin computar'}`}
            />
          ))}
        </div>
        <div className="leyenda-calendario">
          <span><i style={{ background: 'var(--verde-500)' }} /> Completo</span>
          <span><i style={{ background: 'var(--ambar-borde)' }} /> Parcial</span>
          <span><i style={{ background: 'var(--rojo-borde)' }} /> Sin registro</span>
          <span><i style={{ background: 'repeating-linear-gradient(45deg,#f2f4f3,#f2f4f3 3px,#e3e7e5 3px,#e3e7e5 6px)' }} /> Sin computar</span>
        </div>
      </section>

      {/* RN-51 — la leyenda al pie, sin excepción. */}
      <LeyendaCumplimiento texto={datos.framing.legend} />
    </>
  );
}

function Periodo({ rotulo, valor }: { rotulo: string; valor: number }) {
  const tono = valor >= 90 ? '' : valor >= 70 ? 'alerta' : 'peligro';
  return (
    <div className={`indicador ${tono}`} style={{ cursor: 'default' }}>
      <span className="valor">{formatPct(valor)}</span>
      <span className="rotulo">{rotulo}</span>
    </div>
  );
}

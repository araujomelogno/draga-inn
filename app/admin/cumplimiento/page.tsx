'use client';

import { useState } from 'react';
import { BUILDING_ID } from '@/ui/SesionProvider';
import { useApi } from '@/ui/datos';
import { Esqueleto, ErrorDeRed, LeyendaCumplimiento, Vacio } from '@/ui/estados';
import { formatDate, formatMoney, formatPct } from '@/shared/format';
import { TRADE_LABELS } from '@/shared/schemas';

type Pestana = 'cumplimiento' | 'piscina' | 'omitidos' | 'tareas' | 'temporada';

type Overview = {
  framing: { title: string; legend: string };
  range: { from: string; to: string };
  season: { isHigh: boolean; label: string };
  compliancePct: number; requiredItems: number; completedItems: number;
  streak: { complete: number; missing: number };
  calendar: { date: string; status: string; computed: boolean; compliancePct: number; poolLogged: boolean | null; poolOutOfRange: boolean | null }[];
  incompleteDays: { date: string; status: string; pct: number; missing: string[] }[];
};

/** ESPEC §5.11 — Cumplimiento y análisis operativo. */
export default function Cumplimiento() {
  const [tab, setTab] = useState<Pestana>('cumplimiento');
  const [periodo, setPeriodo] = useState<'day' | 'week' | 'month' | 'season'>('month');

  const ov = useApi<Overview>(BUILDING_ID, `/compliance?period=${periodo}&dias=90`);

  if (ov.cargando) return <Esqueleto filas={10} />;
  if (ov.error) return <ErrorDeRed onReintentar={ov.recargar} />;
  if (!ov.datos) return null;

  return (
    <>
      {/* RN-51: el título es el del plan del edificio */}
      <h1>{ov.datos.framing.title}</h1>

      <nav className="pestanas" aria-label="Secciones de análisis">
        {([
          ['cumplimiento', 'Cumplimiento'], ['piscina', 'Piscina'], ['omitidos', 'Ítems omitidos'],
          ['tareas', 'Tareas aprobadas'], ['temporada', 'Temporada'],
        ] as [Pestana, string][]).map(([k, l]) => (
          <a key={k} href={`#${k}`} aria-current={tab === k ? 'page' : undefined}
            onClick={(e) => { e.preventDefault(); setTab(k); }}>{l}</a>
        ))}
      </nav>

      {tab === 'cumplimiento' ? <TabCumplimiento datos={ov.datos} periodo={periodo} setPeriodo={setPeriodo} /> : null}
      {tab === 'piscina' ? <TabPiscina /> : null}
      {tab === 'omitidos' ? <TabOmitidos /> : null}
      {tab === 'tareas' ? <TabTareas /> : null}
      {tab === 'temporada' ? <TabTemporada /> : null}

      {/* RN-51 — al pie, siempre */}
      <LeyendaCumplimiento texto={ov.datos.framing.legend} />
    </>
  );
}

function TabCumplimiento({ datos, periodo, setPeriodo }: { datos: Overview; periodo: string; setPeriodo: (p: 'day' | 'week' | 'month' | 'season') => void }) {
  return (
    <>
      <div className="fila" style={{ marginBottom: '1rem' }}>
        {([['day', 'Día'], ['week', 'Semana'], ['month', 'Mes'], ['season', 'Temporada']] as const).map(([v, l]) => (
          <button key={v} type="button" className={`boton ${periodo === v ? '' : 'secundario'}`} onClick={() => setPeriodo(v)}>{l}</button>
        ))}
      </div>

      <div className="grilla">
        <div className="indicador" style={{ cursor: 'default' }}>
          <span className="valor">{formatPct(datos.compliancePct)}</span>
          <span className="rotulo">Del plan cumplido ({formatDate(datos.range.from)} a {formatDate(datos.range.to)})</span>
        </div>
        <div className="indicador" style={{ cursor: 'default' }}>
          <span className="valor">{datos.completedItems}/{datos.requiredItems}</span>
          <span className="rotulo">Ítems requeridos completados</span>
        </div>
        <div className={`indicador ${datos.streak.missing > 0 ? 'alerta' : ''}`} style={{ cursor: 'default' }}>
          <span className="valor">{datos.streak.missing > 0 ? datos.streak.missing : datos.streak.complete}</span>
          <span className="rotulo">{datos.streak.missing > 0 ? 'Días seguidos sin registro' : 'Días seguidos completos'}</span>
        </div>
      </div>

      <section className="tarjeta" style={{ marginTop: '1rem' }}>
        <h2>Últimos 90 días</h2>
        <div className="calendario">
          {datos.calendar.map((d) => (
            <span key={d.date} className={`dia ${d.computed ? d.status : 'sin-computar'}`}
              title={`${formatDate(d.date)} — ${d.computed ? `${formatPct(d.compliancePct)}` : 'sin computar'}`} />
          ))}
        </div>
        {/* RN-43: un día sin registro y un día fuera de rango son cosas distintas */}
        <div className="leyenda-calendario">
          <span><i style={{ background: 'var(--verde-500)' }} /> Completo</span>
          <span><i style={{ background: 'var(--ambar-borde)' }} /> Parcial</span>
          <span><i style={{ background: 'var(--rojo-borde)' }} /> Sin registro</span>
          <span><i style={{ background: 'repeating-linear-gradient(45deg,#f2f4f3,#f2f4f3 3px,#e3e7e5 3px,#e3e7e5 6px)' }} /> Sin computar</span>
        </div>
      </section>

      <section className="tarjeta">
        <h2>Días incompletos</h2>
        {datos.incompleteDays.length === 0 ? (
          <p style={{ color: 'var(--texto-suave)', marginBottom: 0 }}>Ninguno en el período.</p>
        ) : (
          <div className="tabla-scroll">
            <table className="tabla">
              <thead><tr><th>Fecha</th><th>Estado</th><th>Cumplido</th><th>Qué faltó</th></tr></thead>
              <tbody>
                {datos.incompleteDays.map((d) => (
                  <tr key={d.date}>
                    <td>{formatDate(d.date)}</td>
                    <td><span className={`etiqueta ${d.status === 'missing' ? 'roja' : 'ambar'}`}>{d.status === 'missing' ? 'Sin registro' : 'Parcial'}</span></td>
                    <td className="num">{formatPct(d.pct)}</td>
                    <td>{d.missing.slice(0, 5).join(' · ')}{d.missing.length > 5 ? ` y ${d.missing.length - 5} más` : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

type Serie = {
  points: { date: string; present: boolean; outOfRange: boolean; values: Record<string, number | null> }[];
  ranges: Record<string, { min: number; max: number; label: string; unit: string }>;
  params: string[];
};

function TabPiscina() {
  const serie = useApi<Serie>(BUILDING_ID, '/pool-logs?serie=1');
  const trends = useApi<{ alerts: { param: string; label: string; direction: string; values: number[]; unit: string }[] }>(BUILDING_ID, '/analytics/pool-trends?days=30');

  if (serie.cargando) return <Esqueleto filas={8} />;
  if (serie.error) return <ErrorDeRed onReintentar={serie.recargar} />;
  if (!serie.datos) return null;

  return (
    <>
      {/* RN-47 */}
      {trends.datos?.alerts.map((a) => (
        <div key={a.param} className="aviso ambar">
          <strong>Aviso de tendencia — {a.label}</strong>
          Tres mediciones consecutivas {a.direction === 'up' ? 'en alza' : 'a la baja'}: {a.values.join(' → ')} {a.unit}.
          Puede estar dentro de rango y aun así conviene corregir.
        </div>
      ))}

      {serie.datos.params.map((p) => {
        const rango = serie.datos!.ranges[p]!;
        const valores = serie.datos!.points.map((pt) => pt.values[p] ?? null);
        const max = Math.max(rango.max * 1.4, ...valores.filter((v): v is number => v !== null));
        return (
          <section className="tarjeta" key={p}>
            <div className="entre">
              <h2 style={{ marginBottom: 0 }}>{rango.label}</h2>
              <span className="rango-ref">Rango {rango.min}–{rango.max} {rango.unit}</span>
            </div>
            <div className="serie">
              {serie.datos!.points.map((pt, i) => {
                const v = valores[i] ?? null;
                // Los días sin registro se dibujan como HUECOS. No se interpolan.
                if (v === null || !pt.present) {
                  return <span key={pt.date} className="punto hueco" title={`${formatDate(pt.date)}: sin registro`} />;
                }
                const fuera = v < rango.min || v > rango.max;
                return (
                  <span key={pt.date} className={`punto ${fuera ? 'fuera' : ''}`} title={`${formatDate(pt.date)}: ${v} ${rango.unit}`}>
                    <span className="barra" style={{ height: `${Math.max(4, (v / max) * 100)}%` }} />
                  </span>
                );
              })}
            </div>
            <p className="rango-ref" style={{ marginTop: '.4rem' }}>
              La línea punteada roja marca los días sin registro. No se interpolan: un hueco es un hueco.
            </p>
          </section>
        );
      })}
    </>
  );
}

function TabOmitidos() {
  const { datos, cargando, error, recargar } = useApi<{ threshold: number; items: { item_key: string; label: string; occurrences: number; times_missed: number; miss_pct: string }[] }>(
    BUILDING_ID, '/analytics/omitted-items',
  );
  if (cargando) return <Esqueleto filas={6} />;
  if (error) return <ErrorDeRed onReintentar={recargar} />;
  if (!datos || datos.items.length === 0) {
    return <Vacio titulo="No hay ítems sistemáticamente omitidos." detalle={`Ninguno supera el ${datos?.threshold ?? 80} % de omisión en los últimos 30 días.`} />;
  }

  return (
    <section className="tarjeta">
      <h2>Ítems sin marcar en ≥ {datos.threshold} % de los días</h2>
      <p style={{ color: 'var(--texto-suave)' }}>
        Puede que la plantilla necesite revisión: quizá el ítem ya no aplica, o está mal redactado.
      </p>
      <div className="tabla-scroll">
        <table className="tabla">
          <thead><tr><th>Ítem</th><th>Instancias</th><th>Sin marcar</th><th>% omisión</th></tr></thead>
          <tbody>
            {datos.items.map((i) => (
              <tr key={i.item_key}>
                <td>{i.label}</td>
                <td className="num">{i.occurrences}</td>
                <td className="num">{i.times_missed}</td>
                <td className="num"><span className="etiqueta ambar">{formatPct(i.miss_pct)}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function TabTareas() {
  const { datos, cargando, error, recargar } = useApi<{ from: string; to: string; byTrade: { trade: string; total: number; avg_minutes: string; total_cost: string; escalation_pct: string | null }[] }>(
    BUILDING_ID, '/analytics/approved-tasks',
  );
  if (cargando) return <Esqueleto filas={6} />;
  if (error) return <ErrorDeRed onReintentar={recargar} />;
  if (!datos || datos.byTrade.length === 0) return <Vacio titulo="Todavía no hay tareas aprobadas registradas." />;

  return (
    <section className="tarjeta">
      <h2>Tareas aprobadas · {formatDate(datos.from)} a {formatDate(datos.to)}</h2>
      <div className="tabla-scroll">
        <table className="tabla">
          <thead><tr><th>Rubro</th><th>Total</th><th>Tiempo promedio</th><th>Costo acumulado</th><th>Tasa de derivación</th></tr></thead>
          <tbody>
            {datos.byTrade.map((t) => (
              <tr key={t.trade}>
                <td>{TRADE_LABELS[t.trade as keyof typeof TRADE_LABELS] ?? t.trade}</td>
                <td className="num">{t.total}</td>
                <td className="num">{Math.round(Number(t.avg_minutes))} min</td>
                <td className="num">{formatMoney(t.total_cost)}</td>
                <td className="num">{formatPct(t.escalation_pct ?? 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function TabTemporada() {
  const alta = useApi<Overview>(BUILDING_ID, '/compliance?period=season');
  const mes = useApi<Overview>(BUILDING_ID, '/compliance?period=month');
  if (alta.cargando || mes.cargando) return <Esqueleto filas={6} />;
  if (!alta.datos || !mes.datos) return <ErrorDeRed onReintentar={alta.recargar} />;

  return (
    <section className="tarjeta">
      <h2>Comparativo de temporada</h2>
      <div className="tabla-scroll">
        <table className="tabla">
          <thead><tr><th>Período</th><th>Rango</th><th>Cumplimiento</th><th>Ítems requeridos</th><th>Días sin registro</th></tr></thead>
          <tbody>
            <tr>
              <td>{alta.datos.season.label}</td>
              <td>{formatDate(alta.datos.range.from)} a {formatDate(alta.datos.range.to)}</td>
              <td className="num">{formatPct(alta.datos.compliancePct)}</td>
              <td className="num">{alta.datos.requiredItems}</td>
              <td className="num">{alta.datos.streak.missing}</td>
            </tr>
            <tr>
              <td>Mes en curso</td>
              <td>{formatDate(mes.datos.range.from)} a {formatDate(mes.datos.range.to)}</td>
              <td className="num">{formatPct(mes.datos.compliancePct)}</td>
              <td className="num">{mes.datos.requiredItems}</td>
              <td className="num">{mes.datos.streak.missing}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}

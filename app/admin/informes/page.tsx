'use client';

import { useState } from 'react';
import { BUILDING_ID } from '@/ui/SesionProvider';
import { useApi } from '@/ui/datos';
import { Esqueleto, ErrorDeRed, LeyendaCumplimiento } from '@/ui/estados';
import { formatMoney, formatPct } from '@/shared/format';
import type { MonthlyReportContent } from '@/db/schema/logbook';

type Vista = {
  period: string; periodLabel: string; content: MonthlyReportContent;
  narrative: string | null; controlJustification: string | null;
  status: 'draft' | 'submitted'; version: number;
};

export default function Informes() {
  const [mes, setMes] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return d.toISOString().slice(0, 7);
  });
  const { datos, cargando, error, recargar } = useApi<Vista>(BUILDING_ID, `/reports/monthly/${mes}`);

  return (
    <>
      <div className="entre">
        <h1>Informes mensuales</h1>
        <label className="fila" style={{ gap: '.4rem' }}>
          Período
          <input type="month" value={mes} onChange={(e) => setMes(e.target.value)} style={{ width: 'auto' }} />
        </label>
      </div>

      {cargando ? <Esqueleto filas={8} /> : null}
      {error ? <ErrorDeRed onReintentar={recargar} /> : null}

      {datos ? (
        <>
          <div className="entre">
            <h2>{datos.periodLabel}</h2>
            <span className={`etiqueta ${datos.status === 'submitted' ? '' : 'ambar'}`}>
              {datos.status === 'submitted' ? `Enviado · versión ${datos.version}` : 'Borrador'}
            </span>
          </div>

          {/* RN-50 */}
          <section className="tarjeta">
            <h3>Resumen de control</h3>
            <div className="grilla" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))' }}>
              <Dato r="Previstas" v={datos.content.control.planned} />
              <Dato r="Completadas" v={datos.content.control.completed} />
              <Dato r="Pendientes" v={datos.content.control.pending} />
              <Dato r="Cumplimiento" v={formatPct(datos.content.control.compliancePct)} />
            </div>
            {datos.controlJustification ? (
              <>
                <h4 style={{ marginTop: '1rem' }}>Justificación de lo pendiente</h4>
                <p style={{ whiteSpace: 'pre-wrap' }}>{datos.controlJustification}</p>
              </>
            ) : null}
          </section>

          <section className="tarjeta">
            <h3>Operación</h3>
            <div className="grilla" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))' }}>
              <Dato r="Reclamos abiertos" v={datos.content.tickets.opened} />
              <Dato r="Reclamos cerrados" v={datos.content.tickets.closed} />
              <Dato r="Abiertos al cierre" v={datos.content.tickets.open} />
              <Dato r="Mantenimiento" v={`${datos.content.maintenance.done}/${datos.content.maintenance.planned}`} />
              <Dato r="Tareas aprobadas" v={datos.content.approvedTasks.total} />
              <Dato r="Derivaciones" v={formatPct(datos.content.approvedTasks.escalationPct)} />
              <Dato r="Incidentes" v={datos.content.incidents.total} />
              <Dato r="Gasto" v={formatMoney(datos.content.spend.total, datos.content.spend.currency)} />
            </div>
          </section>

          {/* RN-43: registrado / fuera de rango / faltante, tres cosas distintas */}
          <section className="tarjeta">
            <h3>Piscina</h3>
            <div className="grilla" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))' }}>
              <Dato r="Registradas" v={datos.content.pool.logged} />
              <Dato r="Esperadas" v={datos.content.pool.expected} />
              <Dato r="Fuera de rango" v={datos.content.pool.outOfRange} />
              <Dato r="Días sin registro" v={datos.content.pool.missing} />
            </div>
          </section>

          {/* CB-10 */}
          {datos.content.emptyBlocks.length > 0 ? (
            <div className="aviso info">
              <strong>Bloques sin datos este mes</strong>
              {datos.content.emptyBlocks.join(' · ')}
            </div>
          ) : null}

          {datos.narrative ? (
            <section className="tarjeta">
              <h3>Recomendaciones y observaciones del encargado</h3>
              <p style={{ whiteSpace: 'pre-wrap' }}>{datos.narrative}</p>
            </section>
          ) : null}

          <LeyendaCumplimiento texto="Estos indicadores miden el cumplimiento del plan operativo del edificio, no el desempeño de una persona. Su uso con fines disciplinarios requiere el procedimiento previsto en el régimen de faltas y sanciones." />
        </>
      ) : null}
    </>
  );
}

function Dato({ r, v }: { r: string; v: string | number }) {
  return (
    <div className="indicador" style={{ cursor: 'default' }}>
      <span className="valor">{v}</span>
      <span className="rotulo">{r}</span>
    </div>
  );
}

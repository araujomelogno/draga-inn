'use client';

import { useState } from 'react';
import { BUILDING_ID } from '@/ui/SesionProvider';
import { useApi } from '@/ui/datos';
import { Esqueleto, ErrorDeRed } from '@/ui/estados';
import { formatDate } from '@/shared/format';
import { localDate } from '@/shared/dates';
import type { ChecklistItem } from '@/db/schema/logbook';

type Checklist = {
  instanceId: string; name: string; freq: string; periodDate: string; status: string;
  items: (ChecklistItem & { done: boolean; note: string | null })[];
  progress: { done: number; total: number };
};
type Dia = { date: string; season: { isHigh: boolean; label: string }; checklists: Checklist[] };

/** ESPEC §2.2 — Registros › Planillas del encargado. Solo lectura desde la consola. */
export default function Planillas() {
  const [fecha, setFecha] = useState(localDate());
  const { datos, cargando, error, recargar } = useApi<Dia>(BUILDING_ID, `/checklists/today?fecha=${fecha}`);

  return (
    <>
      <div className="entre">
        <h1>Planillas del encargado</h1>
        <label className="fila" style={{ gap: '.4rem' }}>
          Ver el día
          <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} style={{ width: 'auto' }} />
        </label>
      </div>

      {cargando ? <Esqueleto filas={8} /> : null}
      {error ? <ErrorDeRed onReintentar={recargar} /> : null}

      {datos ? (
        <>
          <p style={{ color: 'var(--texto-suave)' }}>
            {formatDate(datos.date)} · {datos.season.label}
          </p>
          {datos.checklists.map((c) => (
            <section className="tarjeta" key={c.instanceId}>
              <div className="entre">
                <h2 style={{ marginBottom: 0 }}>{c.name}</h2>
                <span className={`etiqueta ${c.progress.done >= c.progress.total ? '' : c.progress.done === 0 ? 'roja' : 'ambar'}`}>
                  {c.progress.done}/{c.progress.total} requeridos
                </span>
              </div>
              <div className="tabla-scroll" style={{ marginTop: '.7rem' }}>
                <table className="tabla">
                  <thead><tr><th>Sección</th><th>Ítem</th><th>Estado</th><th>Nota</th></tr></thead>
                  <tbody>
                    {c.items.map((i) => (
                      <tr key={i.key}>
                        <td>{i.section}</td>
                        <td>{i.label}{!i.required ? <span className="opcional"> · opcional</span> : null}</td>
                        <td>
                          <span className={`etiqueta ${i.done ? '' : i.required ? 'roja' : 'neutra'}`}>
                            {i.done ? 'Hecho' : 'Sin marcar'}
                          </span>
                        </td>
                        <td>{i.note ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </>
      ) : null}
    </>
  );
}

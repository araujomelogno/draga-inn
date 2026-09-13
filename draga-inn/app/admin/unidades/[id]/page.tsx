'use client';

import Link from 'next/link';
import { use, useState } from 'react';
import { BUILDING_ID } from '@/ui/SesionProvider';
import { useApi } from '@/ui/datos';
import { Esqueleto, ErrorDeRed } from '@/ui/estados';
import { formatDate, formatDateTime } from '@/shared/format';
import { TICKET_STATUS_LABELS, type TicketStatus } from '@/policy/transitions';
import { localDate } from '@/shared/dates';

type Detalle = {
  unit: { id: string; code: string; unitType: string; floor: string | null; coefficient: string | null; areaM2: string | null };
  asOf: string;
  occupants: { id: string; role: string; full_name: string; email: string | null; phone: string | null; from_date: string; to_date: string | null; current: boolean }[];
  tickets: { id: string; number: number; title: string; status: TicketStatus; created_at: string }[];
  children: { id: string; code: string; unit_type: string }[];
  documents: { id: string; title: string; doc_type: string; issued_on: string | null; expires_on: string | null }[];
  incomplete: boolean;
};

const ROLES: Record<string, string> = { owner: 'Propietario', tenant: 'Inquilino', occupant: 'Ocupante' };

/** ESPEC §5.5 — Ficha de unidad, con consulta histórica «ver a fecha» (RN-03). */
export default function FichaUnidad({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [aFecha, setAFecha] = useState(localDate());
  const { datos, cargando, error, recargar } = useApi<Detalle>(BUILDING_ID, `/units/${id}?aFecha=${aFecha}`);

  if (cargando) return <Esqueleto filas={10} />;
  if (error) return <ErrorDeRed onReintentar={recargar} />;
  if (!datos) return null;

  const vigentes = datos.occupants.filter((o) => o.current);
  const historico = datos.occupants.filter((o) => !o.current);

  return (
    <>
      <h1>Unidad {datos.unit.code}</h1>

      {datos.incomplete ? (
        <div className="aviso ambar"><strong>Sin titular vigente</strong>Cargá el propietario para completar la ficha.</div>
      ) : null}

      <section className="tarjeta">
        <div className="entre">
          <h2 style={{ marginBottom: 0 }}>Titularidad</h2>
          <label className="fila" style={{ gap: '.4rem', fontSize: '.88rem' }}>
            Ver a fecha
            <input type="date" value={aFecha} onChange={(e) => setAFecha(e.target.value)} style={{ width: 'auto' }} />
          </label>
        </div>

        {vigentes.length === 0 ? (
          <p style={{ color: 'var(--texto-suave)' }}>Nadie figuraba al {formatDate(aFecha)}.</p>
        ) : (
          <div className="tabla-scroll">
            <table className="tabla">
              <thead><tr><th>Rol</th><th>Nombre</th><th>Contacto</th><th>Desde</th></tr></thead>
              <tbody>
                {vigentes.map((o) => (
                  <tr key={o.id}>
                    <td>{ROLES[o.role] ?? o.role}</td>
                    <td>{o.full_name}</td>
                    <td>{[o.email, o.phone].filter(Boolean).join(' · ') || '—'}</td>
                    <td>{formatDate(o.from_date)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {historico.length > 0 ? (
          <>
            <h3 style={{ marginTop: '1.25rem' }}>Histórico de titularidad</h3>
            <p style={{ fontSize: '.86rem', color: 'var(--texto-suave)' }}>
              La titularidad nunca se sobrescribe: se cierra un período y se abre otro.
            </p>
            <div className="tabla-scroll">
              <table className="tabla">
                <thead><tr><th>Rol</th><th>Nombre</th><th>Desde</th><th>Hasta</th></tr></thead>
                <tbody>
                  {historico.map((o) => (
                    <tr key={o.id}>
                      <td>{ROLES[o.role] ?? o.role}</td>
                      <td>{o.full_name}</td>
                      <td>{formatDate(o.from_date)}</td>
                      <td>{o.to_date ? formatDate(o.to_date) : 'Vigente'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : null}
      </section>

      <section className="tarjeta">
        <h2>Datos</h2>
        <div className="grilla" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
          <Dato r="Coeficiente" v={datos.unit.coefficient ? `${Number(datos.unit.coefficient).toFixed(4)} %` : '—'} />
          <Dato r="Piso" v={datos.unit.floor ?? '—'} />
          <Dato r="Superficie" v={datos.unit.areaM2 ? `${datos.unit.areaM2} m²` : '—'} />
          <Dato r="Cocheras y bauleras" v={datos.children.map((c) => c.code).join(', ') || '—'} />
        </div>
      </section>

      <section className="tarjeta">
        <h2>Reclamos</h2>
        {datos.tickets.length === 0 ? <p style={{ color: 'var(--texto-suave)' }}>No hay reclamos para esta unidad.</p> : (
          <div className="tabla-scroll">
            <table className="tabla">
              <thead><tr><th>N.º</th><th>Título</th><th>Estado</th><th>Creado</th></tr></thead>
              <tbody>
                {datos.tickets.map((t) => (
                  <tr key={t.id}>
                    <td><Link href={`/admin/tickets/${t.id}`}>#{t.number}</Link></td>
                    <td>{t.title}</td>
                    <td><span className="etiqueta neutra">{TICKET_STATUS_LABELS[t.status]}</span></td>
                    <td>{formatDateTime(t.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {datos.documents.length > 0 ? (
        <section className="tarjeta">
          <h2>Documentos</h2>
          <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
            {datos.documents.map((d) => (
              <li key={d.id}>{d.title} — {d.doc_type}{d.expires_on ? ` · vence el ${formatDate(d.expires_on)}` : ''}</li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}

function Dato({ r, v }: { r: string; v: string }) {
  return (
    <div>
      <p style={{ margin: 0, fontSize: '.78rem', textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--texto-suave)', fontWeight: 700 }}>{r}</p>
      <p style={{ margin: 0, fontWeight: 600 }}>{v}</p>
    </div>
  );
}

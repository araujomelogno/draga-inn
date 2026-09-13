'use client';

import { BUILDING_ID, useSesion } from '@/ui/SesionProvider';
import { useApi } from '@/ui/datos';
import { Esqueleto, ErrorDeRed, Vacio } from '@/ui/estados';
import { formatDate } from '@/shared/format';
import { TICKET_STATUS_LABELS, type TicketStatus } from '@/policy/transitions';

type Detalle = {
  unit: { id: string; code: string; unitType: string; floor: string | null; coefficient: string | null; areaM2: string | null };
  occupants: { id: string; role: string; full_name: string; from_date: string; to_date: string | null; current: boolean }[];
  tickets: { id: string; number: number; title: string; status: TicketStatus; created_at: string }[];
  children: { id: string; code: string; unit_type: string }[];
  documents: { id: string; title: string; doc_type: string; expires_on: string | null }[];
};

const ROLES: Record<string, string> = { owner: 'Propietario', tenant: 'Inquilino', occupant: 'Ocupante' };
const TIPOS: Record<string, string> = { parking: 'Cochera', storage: 'Baulera' };

export default function MiUnidad() {
  const { perfil } = useSesion();
  const unidad = perfil?.unitIds[0];
  const { datos, cargando, error, recargar } = useApi<Detalle>(BUILDING_ID, unidad ? `/units/${unidad}` : null);

  if (!unidad) {
    return <Vacio titulo="Todavía no tenés una unidad asociada."
      detalle="Si sos propietario o inquilino, pedile al administrador que vincule tu cuenta a tu unidad." />;
  }
  if (cargando) return <Esqueleto filas={8} />;
  if (error) return <ErrorDeRed onReintentar={recargar} />;
  if (!datos) return null;

  const abiertos = datos.tickets.filter((t) => t.status !== 'closed');

  return (
    <>
      <h1>Unidad {datos.unit.code}</h1>

      <section className="tarjeta">
        <h2>Datos</h2>
        <dl style={{ margin: 0 }}>
          <Linea t="Piso" v={datos.unit.floor ?? '—'} />
          <Linea t="Coeficiente de copropiedad" v={datos.unit.coefficient ? `${Number(datos.unit.coefficient).toFixed(4)} %` : '—'} />
          <Linea t="Superficie" v={datos.unit.areaM2 ? `${datos.unit.areaM2} m²` : '—'} />
          {datos.children.map((c) => (
            <Linea key={c.id} t={TIPOS[c.unit_type] ?? c.unit_type} v={c.code} />
          ))}
        </dl>
      </section>

      <section className="tarjeta">
        <h2>Quién figura</h2>
        {datos.occupants.filter((o) => o.current).map((o) => (
          <div key={o.id} className="entre" style={{ padding: '.45rem 0', borderBottom: '1px solid var(--borde)' }}>
            <span>{o.full_name}</span>
            <span className="etiqueta neutra">{ROLES[o.role] ?? o.role} desde {formatDate(o.from_date)}</span>
          </div>
        ))}
      </section>

      <section className="tarjeta">
        <h2>Reclamos abiertos</h2>
        {abiertos.length === 0 ? (
          <p style={{ color: 'var(--texto-suave)', marginBottom: 0 }}>No hay reclamos abiertos para tu unidad.</p>
        ) : (
          abiertos.map((t) => (
            <a key={t.id} href={`/portal/reclamos/${t.id}`} className="entre"
              style={{ padding: '.45rem 0', borderBottom: '1px solid var(--borde)', textDecoration: 'none', color: 'inherit' }}>
              <span>#{t.number} · {t.title}</span>
              <span className="etiqueta neutra">{TICKET_STATUS_LABELS[t.status]}</span>
            </a>
          ))
        )}
      </section>

      {datos.documents.length > 0 ? (
        <section className="tarjeta">
          <h2>Documentos de tu unidad</h2>
          <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
            {datos.documents.map((d) => <li key={d.id}>{d.title}</li>)}
          </ul>
        </section>
      ) : null}
    </>
  );
}

function Linea({ t, v }: { t: string; v: string }) {
  return (
    <div className="entre" style={{ padding: '.4rem 0', borderBottom: '1px solid var(--borde)' }}>
      <dt style={{ color: 'var(--texto-suave)' }}>{t}</dt>
      <dd style={{ margin: 0, fontWeight: 650 }}>{v}</dd>
    </div>
  );
}

'use client';

import Link from 'next/link';
import { BUILDING_ID } from '@/ui/SesionProvider';
import { useApi } from '@/ui/datos';
import { Esqueleto, ErrorDeRed, Vacio } from '@/ui/estados';
import { formatDateTime } from '@/shared/format';
import { TICKET_STATUS_LABELS, type TicketStatus } from '@/policy/transitions';

type Reclamo = { id: string; number: number; title: string; status: TicketStatus; priority: string; category: string; created_at: string; resolved_at: string | null; unit_code: string | null };

export default function MisReclamos() {
  const { datos, cargando, error, recargar } = useApi<Reclamo[]>(BUILDING_ID, '/portal/reclamos');

  if (cargando) return <Esqueleto filas={6} />;
  if (error) return <ErrorDeRed onReintentar={recargar} />;

  return (
    <>
      <div className="entre">
        <h1>Mis reclamos</h1>
        <Link className="boton" href="/portal/reclamos/nuevo">Nuevo</Link>
      </div>

      {!datos || datos.length === 0 ? (
        <Vacio titulo="Todavía no abriste ningún reclamo."
          detalle="Si notás algo en tu unidad o en las áreas comunes, contanoslo."
          accion={<Link className="boton" href="/portal/reclamos/nuevo">Abrir un reclamo</Link>} />
      ) : (
        datos.map((r) => (
          <Link key={r.id} href={`/portal/reclamos/${r.id}`} className="tarjeta"
            style={{ display: 'block', textDecoration: 'none', color: 'inherit' }}>
            <div className="entre">
              <strong>#{r.number} · {r.title}</strong>
              <span className={`etiqueta ${r.status === 'resolved' ? '' : 'neutra'}`}>{TICKET_STATUS_LABELS[r.status]}</span>
            </div>
            <p style={{ margin: '.3rem 0 0', fontSize: '.86rem', color: 'var(--texto-suave)' }}>
              {r.unit_code ? `Unidad ${r.unit_code}` : 'Área común'} · abierto el {formatDateTime(r.created_at)}
            </p>
          </Link>
        ))
      )}
    </>
  );
}

'use client';

import Link from 'next/link';
import { BUILDING_ID, useSesion } from '@/ui/SesionProvider';
import { useApi } from '@/ui/datos';
import { Esqueleto, Vacio } from '@/ui/estados';
import { TICKET_STATUS_LABELS, type TicketStatus } from '@/policy/transitions';

type Reclamo = { id: string; number: number; title: string; status: TicketStatus; created_at: string; unit_code: string | null };

export default function Inicio() {
  const { perfil } = useSesion();
  const { datos, cargando } = useApi<Reclamo[]>(BUILDING_ID, '/portal/reclamos');

  const abiertos = (datos ?? []).filter((r) => r.status !== 'closed');

  return (
    <>
      <h1>Hola{perfil?.user.displayName ? `, ${perfil.user.displayName.split(' ')[0]}` : ''}</h1>
      <p style={{ color: 'var(--texto-suave)' }}>Edificio Draga Inn · Punta del Este</p>

      <section className="tarjeta">
        <h2>Tus reclamos</h2>
        {cargando ? <Esqueleto filas={3} /> : null}
        {datos && abiertos.length === 0 ? (
          <Vacio titulo="No tenés reclamos abiertos."
            accion={<Link className="boton" href="/portal/reclamos/nuevo">Abrir un reclamo</Link>} />
        ) : null}
        {abiertos.map((r) => (
          <Link key={r.id} href={`/portal/reclamos/${r.id}`} className="entre"
            style={{ padding: '.55rem 0', borderBottom: '1px solid var(--borde)', textDecoration: 'none', color: 'inherit' }}>
            <span>#{r.number} · {r.title}</span>
            <span className="etiqueta neutra">{TICKET_STATUS_LABELS[r.status]}</span>
          </Link>
        ))}
        {abiertos.length > 0 ? (
          <Link className="boton ancho" href="/portal/reclamos/nuevo" style={{ marginTop: '1rem' }}>Abrir un reclamo</Link>
        ) : null}
      </section>

      <section className="tarjeta">
        <h2>Accesos</h2>
        <div className="fila">
          <Link className="boton secundario" href="/portal/unidad">Mi unidad</Link>
          <Link className="boton secundario" href="/portal/documentos">Documentos del edificio</Link>
        </div>
      </section>
    </>
  );
}

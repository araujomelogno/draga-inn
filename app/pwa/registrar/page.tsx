'use client';

import Link from 'next/link';

/** ESPEC §2.1 — Hoja de acciones de «Registrar +». */
const ACCIONES = [
  { href: '/pwa/ticket', titulo: 'Ticket', detalle: 'Un reclamo o una solicitud concreta', icono: 'ticket' },
  { href: '/pwa/piscina', titulo: 'Piscina', detalle: 'Medición diaria del Anexo A', icono: 'gota' },
  { href: '/pwa/tarea', titulo: 'Tarea aprobada', detalle: 'Trabajo del Anexo B', icono: 'llave' },
  { href: '/pwa/incidente', titulo: 'Incidente', detalle: 'Corte, fuga, accidente — Anexo F', icono: 'alerta' },
  { href: '/pwa/stock', titulo: 'Stock', detalle: 'Entrada, salida o ajuste de insumos', icono: 'caja' },
] as const;

export default function Registrar() {
  return (
    <>
      <h1>Registrar</h1>
      <p style={{ color: 'var(--texto-suave)' }}>¿Qué querés anotar?</p>

      {ACCIONES.map((a) => (
        <Link key={a.href} href={a.href} className="accion">
          <span className="icono" aria-hidden="true"><Icono nombre={a.icono} /></span>
          <span>
            {a.titulo}
            <span style={{ display: 'block', fontWeight: 400, fontSize: '.85rem', color: 'var(--texto-suave)' }}>{a.detalle}</span>
          </span>
        </Link>
      ))}
    </>
  );
}

function Icono({ nombre }: { nombre: string }) {
  const p = { width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.9, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  switch (nombre) {
    case 'ticket': return <svg {...p}><path d="M4 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-4V7Z" /></svg>;
    case 'gota': return <svg {...p}><path d="M12 3s6 6.5 6 10.5a6 6 0 0 1-12 0C6 9.5 12 3 12 3Z" /></svg>;
    case 'llave': return <svg {...p}><path d="m14 7 3-3 3 3-3 3M4 20l7.5-7.5M9 15l-5 5v0" /><circle cx="15.5" cy="8.5" r="3.5" /></svg>;
    case 'alerta': return <svg {...p}><path d="M12 3 2 20h20L12 3Z" /><path d="M12 10v4M12 17h.01" /></svg>;
    default: return <svg {...p}><path d="M3 8 12 3l9 5v8l-9 5-9-5V8Z" /><path d="m3 8 9 5 9-5M12 13v8" /></svg>;
  }
}

'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { BUILDING_ID } from '@/ui/SesionProvider';
import { readCached } from '@/pwa/sync';
import { Esqueleto, ErrorDeRed, Vacio } from '@/ui/estados';
import { formatAge, formatDateTime } from '@/shared/format';
import { TICKET_STATUS_LABELS, type TicketStatus } from '@/policy/transitions';

type Ticket = {
  id: string; number: number; title: string; category: string; priority: string;
  status: TicketStatus; unitCode: string | null; createdAt: string; isOverdue: boolean;
};

export default function Tickets() {
  const [tickets, setTickets] = useState<Ticket[] | null>(null);
  const [cache, setCache] = useState<number | undefined>();
  const [error, setError] = useState(false);

  const cargar = useCallback(async () => {
    try {
      const r = await readCached<Ticket[]>(BUILDING_ID, '/tickets?estado=abiertos');
      setTickets(r.data);
      setCache(r.fromCache ? r.storedAt : undefined);
      setError(false);
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => { void cargar(); }, [cargar]);

  if (!tickets && error) return <ErrorDeRed onReintentar={() => void cargar()} />;
  if (!tickets) return <Esqueleto filas={6} />;

  return (
    <>
      <div className="entre">
        <h1>Tickets</h1>
        <Link className="boton" href="/pwa/ticket">Nuevo</Link>
      </div>

      {cache ? <div className="aviso ambar">Mostrando información guardada del {formatDateTime(new Date(cache))}.</div> : null}

      {tickets.length === 0 ? (
        <Vacio titulo="No hay tickets abiertos." detalle="Cuando aparezca algo, lo vas a ver acá."
          accion={<Link className="boton" href="/pwa/ticket">Crear ticket</Link>} />
      ) : null}

      {tickets.map((t) => (
        <Link key={t.id} href={`/pwa/tickets/${t.id}`} className="tarjeta"
          style={{ display: 'block', textDecoration: 'none', color: 'inherit', borderLeft: t.isOverdue ? '4px solid var(--rojo-borde)' : undefined }}>
          <div className="entre">
            <strong>#{t.number} · {t.title}</strong>
            <span className={`etiqueta ${t.priority === 'critical' ? 'roja' : t.priority === 'high' ? 'ambar' : 'neutra'}`}>
              {t.priority === 'critical' ? 'Crítico' : t.priority === 'high' ? 'Alta' : 'Normal'}
            </span>
          </div>
          <p style={{ margin: '.35rem 0 0', fontSize: '.86rem', color: 'var(--texto-suave)' }}>
            {TICKET_STATUS_LABELS[t.status]}{t.unitCode ? ` · ${t.unitCode}` : ''} · {formatAge(t.createdAt)}
          </p>
        </Link>
      ))}
    </>
  );
}

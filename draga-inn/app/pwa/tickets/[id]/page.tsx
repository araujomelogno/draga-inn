'use client';

import { use, useCallback, useEffect, useState } from 'react';
import { BUILDING_ID } from '@/ui/SesionProvider';
import { MutationError, mutate, readCached } from '@/pwa/sync';
import { Esqueleto, ErrorDeRed } from '@/ui/estados';
import { Campo, Resultado, useEnvio } from '@/ui/formulario';
import { formatDateTime } from '@/shared/format';
import { TICKET_STATUS_LABELS, type TicketStatus } from '@/policy/transitions';

type Detalle = {
  ticket: { id: string; number: number; title: string; description: string | null; status: TicketStatus; priority: string; category: string; createdAt: string };
  comments: { id: string; body: string; isInternal: boolean; createdAt: string; authorName: string | null }[];
  availableTransitions: TicketStatus[];
};

export default function TicketDetalle({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [detalle, setDetalle] = useState<Detalle | null>(null);
  const [error, setError] = useState(false);
  const [comentario, setComentario] = useState('');
  const [nota, setNota] = useState('');
  const { enviando, setEnviando, estado, setEstado } = useEnvio();

  const cargar = useCallback(async () => {
    try {
      const r = await readCached<Detalle>(BUILDING_ID, `/tickets/${id}`);
      setDetalle(r.data);
      setError(false);
    } catch {
      setError(true);
    }
  }, [id]);

  useEffect(() => { void cargar(); }, [cargar]);

  async function cambiarEstado(to: TicketStatus) {
    setEnviando(true);
    setEstado(null);
    try {
      await mutate(BUILDING_ID, `/tickets/${id}`, {
        status: to,
        expectedStatus: detalle?.ticket.status,
        ...(to === 'resolved' ? { resolutionNote: nota } : {}),
      }, { method: 'PATCH', label: `Ticket #${detalle?.ticket.number}: ${TICKET_STATUS_LABELS[to]}` });
      setEstado({ tipo: 'ok', mensaje: `Ticket marcado como ${TICKET_STATUS_LABELS[to]}.` });
      setNota('');
      await cargar();
    } catch (err) {
      setEstado({ tipo: 'error', mensaje: err instanceof MutationError ? err.message : 'No pudimos cambiar el estado.' });
    } finally {
      setEnviando(false);
    }
  }

  async function comentar(e: React.FormEvent) {
    e.preventDefault();
    if (!comentario.trim()) return;
    setEnviando(true);
    try {
      const r = await mutate(BUILDING_ID, `/tickets/${id}/comments`, { body: comentario.trim(), isInternal: false }, {
        label: `Comentario en #${detalle?.ticket.number}`,
      });
      setEstado(r.queued ? { tipo: 'encolado', mensaje: 'El comentario se enviará al recuperar señal.' } : { tipo: 'ok', mensaje: 'Comentario agregado.' });
      setComentario('');
      await cargar();
    } finally {
      setEnviando(false);
    }
  }

  if (!detalle && error) return <ErrorDeRed onReintentar={() => void cargar()} />;
  if (!detalle) return <Esqueleto filas={6} />;

  const t = detalle.ticket;
  const necesitaNota = detalle.availableTransitions.includes('resolved');

  return (
    <>
      <h1>#{t.number} · {t.title}</h1>
      <div className="fila" style={{ marginBottom: '1rem' }}>
        <span className="etiqueta">{TICKET_STATUS_LABELS[t.status]}</span>
        <span className={`etiqueta ${t.priority === 'critical' ? 'roja' : 'neutra'}`}>{t.priority}</span>
      </div>

      <Resultado estado={estado} />

      <section className="tarjeta">
        <p>{t.description}</p>
        <p style={{ fontSize: '.82rem', color: 'var(--texto-suave)', margin: 0 }}>Creado el {formatDateTime(t.createdAt)}</p>
      </section>

      {/* P3: solo las transiciones que este usuario puede hacer */}
      {detalle.availableTransitions.length > 0 ? (
        <section className="tarjeta">
          <h2>Cambiar estado</h2>
          {necesitaNota ? (
            <Campo label="Nota de resolución" htmlFor="nota" ayuda="Obligatoria para marcar como resuelto.">
              <textarea id="nota" value={nota} onChange={(e) => setNota(e.target.value)} />
            </Campo>
          ) : null}
          <div className="fila">
            {detalle.availableTransitions.map((to) => (
              <button key={to} type="button" className="boton secundario" disabled={enviando || (to === 'resolved' && !nota.trim())}
                onClick={() => void cambiarEstado(to)}>
                {TICKET_STATUS_LABELS[to]}
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <section className="tarjeta">
        <h2>Comentarios</h2>
        {detalle.comments.map((c) => (
          <div key={c.id} style={{ padding: '.5rem 0', borderBottom: '1px solid var(--borde)' }}>
            <p style={{ margin: 0 }}>{c.body}</p>
            <p style={{ margin: '.2rem 0 0', fontSize: '.8rem', color: 'var(--texto-suave)' }}>
              {c.authorName ?? 'Sistema'} · {formatDateTime(c.createdAt)}
              {c.isInternal ? <span className="etiqueta neutra" style={{ marginLeft: '.4rem' }}>Interno</span> : null}
            </p>
          </div>
        ))}
        <form onSubmit={comentar} style={{ marginTop: '.85rem' }}>
          <Campo label="Agregar comentario" htmlFor="comentario">
            <textarea id="comentario" value={comentario} onChange={(e) => setComentario(e.target.value)} />
          </Campo>
          <button className="boton" type="submit" disabled={enviando || !comentario.trim()}>Comentar</button>
        </form>
      </section>
    </>
  );
}

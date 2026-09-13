'use client';

import Link from 'next/link';
import { use, useState } from 'react';
import { BUILDING_ID, useSesion } from '@/ui/SesionProvider';
import { enviarApi, useApi } from '@/ui/datos';
import { Esqueleto, ErrorDeRed } from '@/ui/estados';
import { Campo, Resultado, useEnvio } from '@/ui/formulario';
import { formatDateTime } from '@/shared/format';
import { TICKET_STATUS_LABELS, type TicketStatus } from '@/policy/transitions';

type Detalle = {
  ticket: {
    id: string; number: number; title: string; description: string | null; status: TicketStatus;
    priority: string; category: string; caseId: string; unitId: string | null;
    assignedToUserId: string | null; dueDate: string | null; createdAt: string; resolutionNote: string | null;
  };
  comments: { id: string; body: string; isInternal: boolean; createdAt: string; authorName: string | null }[];
  availableTransitions: TicketStatus[];
};

/** ESPEC §5.3 — Detalle del ticket. */
export default function DetalleTicket({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { puede } = useSesion();
  const { datos, cargando, error, recargar } = useApi<Detalle>(BUILDING_ID, `/tickets/${id}`);
  const { enviando, setEnviando, estado, setEstado } = useEnvio();

  const [comentario, setComentario] = useState('');
  const [interno, setInterno] = useState(false);
  const [nota, setNota] = useState('');
  const [comentarioVisible, setComentarioVisible] = useState('');
  const [motivoCierre, setMotivoCierre] = useState('');

  async function cambiar(to: TicketStatus) {
    setEnviando(true);
    setEstado(null);
    const r = await enviarApi(BUILDING_ID, `/tickets/${id}`, {
      status: to,
      expectedStatus: datos?.ticket.status,
      ...(to === 'resolved' ? { resolutionNote: nota } : {}),
      ...(to === 'waiting_owner' ? { ownerVisibleComment: comentarioVisible } : {}),
      ...(to === 'closed' && datos?.ticket.status !== 'resolved' ? { closeReason: motivoCierre } : {}),
    }, 'PATCH');
    setEnviando(false);
    // §9: el error de transición dice QUÉ FALTA y no cambia nada
    setEstado(r.ok
      ? { tipo: 'ok', mensaje: `Ticket en «${TICKET_STATUS_LABELS[to]}».` }
      : { tipo: 'error', mensaje: r.message });
    if (r.ok) { setNota(''); setComentarioVisible(''); setMotivoCierre(''); recargar(); }
  }

  async function comentar(e: React.FormEvent) {
    e.preventDefault();
    setEnviando(true);
    const r = await enviarApi(BUILDING_ID, `/tickets/${id}/comments`, { body: comentario.trim(), isInternal: interno });
    setEnviando(false);
    if (r.ok) { setComentario(''); recargar(); }
    else setEstado({ tipo: 'error', mensaje: r.message });
  }

  if (cargando) return <Esqueleto filas={8} />;
  if (error) return <ErrorDeRed onReintentar={recargar} />;
  if (!datos) return null;

  const t = datos.ticket;

  return (
    <>
      <div className="entre">
        <h1>#{t.number} · {t.title}</h1>
        <Link className="boton secundario" href={`/admin/expedientes/${t.caseId}`}>Ver expediente</Link>
      </div>

      <div className="fila" style={{ marginBottom: '1rem' }}>
        <span className="etiqueta">{TICKET_STATUS_LABELS[t.status]}</span>
        <span className={`etiqueta ${t.priority === 'critical' ? 'roja' : 'neutra'}`}>{t.priority}</span>
        <span className="etiqueta neutra">{t.category}</span>
      </div>

      <Resultado estado={estado} />

      <section className="tarjeta">
        <h2>Descripción</h2>
        <p>{t.description}</p>
        {/* P4: todo dato tiene origen visible */}
        <p style={{ fontSize: '.82rem', color: 'var(--texto-suave)', margin: 0 }}>Creado el {formatDateTime(t.createdAt)}</p>
        {t.resolutionNote ? <><h3 style={{ marginTop: '1rem' }}>Resolución</h3><p>{t.resolutionNote}</p></> : null}
      </section>

      {datos.availableTransitions.length > 0 ? (
        <section className="tarjeta">
          <h2>Cambiar estado</h2>
          {datos.availableTransitions.includes('resolved') ? (
            <Campo label="Nota de resolución" htmlFor="nota" ayuda="Obligatoria para marcar como resuelto.">
              <textarea id="nota" value={nota} onChange={(e) => setNota(e.target.value)} />
            </Campo>
          ) : null}
          {datos.availableTransitions.includes('waiting_owner') ? (
            <Campo label="Comentario visible al propietario" htmlFor="visible" ayuda="Obligatorio para pasar a «Esperando al propietario».">
              <textarea id="visible" value={comentarioVisible} onChange={(e) => setComentarioVisible(e.target.value)} />
            </Campo>
          ) : null}
          {datos.availableTransitions.includes('closed') && t.status !== 'resolved' ? (
            <Campo label="Motivo del descarte" htmlFor="motivo">
              <input id="motivo" type="text" value={motivoCierre} onChange={(e) => setMotivoCierre(e.target.value)} />
            </Campo>
          ) : null}
          <div className="fila">
            {datos.availableTransitions.map((to) => (
              <button key={to} type="button" className="boton secundario" disabled={enviando} onClick={() => void cambiar(to)}>
                {TICKET_STATUS_LABELS[to]}
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <section className="tarjeta">
        <h2>Comentarios</h2>
        {datos.comments.length === 0 ? <p style={{ color: 'var(--texto-suave)' }}>Todavía no hay comentarios.</p> : null}
        {datos.comments.map((c) => (
          <div key={c.id} style={{
            padding: '.6rem .7rem', marginBottom: '.5rem', borderRadius: 'var(--radio-chico)',
            background: c.isInternal ? 'var(--gris-100)' : 'var(--verde-050)',
            borderLeft: `3px solid ${c.isInternal ? 'var(--gris-300)' : 'var(--verde-400)'}`,
          }}>
            <p style={{ margin: 0 }}>{c.body}</p>
            <p style={{ margin: '.25rem 0 0', fontSize: '.8rem', color: 'var(--texto-suave)' }}>
              {c.authorName ?? 'Sistema'} · {formatDateTime(c.createdAt)}
              {/* RN-14: el interno se marca con claridad para que nadie se confunda */}
              {c.isInternal ? <span className="etiqueta neutra" style={{ marginLeft: '.4rem' }}>Interno — no lo ve el propietario</span> : null}
            </p>
          </div>
        ))}

        <form onSubmit={comentar} style={{ marginTop: '1rem' }}>
          <Campo label="Nuevo comentario" htmlFor="comentario">
            <textarea id="comentario" value={comentario} onChange={(e) => setComentario(e.target.value)} />
          </Campo>
          {/* RN-14: el selector solo existe para quien puede escribir internos */}
          {puede('ticket_internal_comment', 'create') ? (
            <div className="fila" style={{ marginBottom: '.75rem' }}>
              <label className="fila" style={{ gap: '.4rem' }}>
                <input type="radio" name="visibilidad" checked={!interno} onChange={() => setInterno(false)} />
                Visible al propietario
              </label>
              <label className="fila" style={{ gap: '.4rem' }}>
                <input type="radio" name="visibilidad" checked={interno} onChange={() => setInterno(true)} />
                Interno
              </label>
            </div>
          ) : null}
          <button className="boton" type="submit" disabled={enviando || !comentario.trim()}>Comentar</button>
        </form>
      </section>
    </>
  );
}

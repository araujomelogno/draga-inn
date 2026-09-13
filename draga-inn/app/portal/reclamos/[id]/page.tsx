'use client';

import { use, useState } from 'react';
import { BUILDING_ID } from '@/ui/SesionProvider';
import { enviarApi, useApi } from '@/ui/datos';
import { Esqueleto, ErrorDeRed } from '@/ui/estados';
import { Campo, Resultado, useEnvio } from '@/ui/formulario';
import { formatDateTime } from '@/shared/format';
import { TICKET_STATUS_LABELS, type TicketStatus } from '@/policy/transitions';

type Detalle = {
  ticket: { id: string; number: number; title: string; description: string | null; status: TicketStatus; createdAt: string; resolvedAt: string | null; resolutionNote: string | null };
  comments: { id: string; body: string; isInternal: boolean; createdAt: string; authorName: string | null }[];
  availableTransitions: TicketStatus[];
};

export default function Reclamo({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { datos, cargando, error, recargar } = useApi<Detalle>(BUILDING_ID, `/tickets/${id}`);
  const [comentario, setComentario] = useState('');
  const { enviando, setEnviando, estado, setEstado } = useEnvio();

  async function comentar(e: React.FormEvent) {
    e.preventDefault();
    setEnviando(true);
    const r = await enviarApi(BUILDING_ID, `/tickets/${id}/comments`, { body: comentario.trim(), isInternal: false });
    setEnviando(false);
    if (r.ok) { setComentario(''); recargar(); }
    else setEstado({ tipo: 'error', mensaje: r.message });
  }

  /** RN-12: reapertura dentro de la ventana. Pasada esa ventana, el botón no aparece. */
  async function reabrir() {
    setEnviando(true);
    const r = await enviarApi(BUILDING_ID, `/tickets/${id}`, { status: 'in_progress', expectedStatus: datos?.ticket.status }, 'PATCH');
    setEnviando(false);
    setEstado(r.ok ? { tipo: 'ok', mensaje: 'Reabrimos tu reclamo.' } : { tipo: 'error', mensaje: r.message });
    if (r.ok) recargar();
  }

  if (cargando) return <Esqueleto filas={6} />;
  if (error) return <ErrorDeRed onReintentar={recargar} />;
  if (!datos) return null;

  const t = datos.ticket;
  const puedeReabrir = t.status === 'resolved' && datos.availableTransitions.includes('in_progress');

  return (
    <>
      <h1>#{t.number} · {t.title}</h1>
      <span className="etiqueta">{TICKET_STATUS_LABELS[t.status]}</span>

      <Resultado estado={estado} />

      <section className="tarjeta" style={{ marginTop: '1rem' }}>
        <p>{t.description}</p>
        <p style={{ fontSize: '.82rem', color: 'var(--texto-suave)', margin: 0 }}>Abierto el {formatDateTime(t.createdAt)}</p>
      </section>

      {t.status === 'resolved' && t.resolutionNote ? (
        <div className="aviso verde">
          <strong>Cómo se resolvió</strong>
          {t.resolutionNote}
        </div>
      ) : null}

      {puedeReabrir ? (
        <div className="aviso info">
          <strong>¿No quedó resuelto?</strong>
          Podés reabrirlo mientras esté dentro del plazo. Después de eso, abrí un reclamo nuevo y mencioná este número.
          <button type="button" className="boton secundario" style={{ marginTop: '.6rem' }} onClick={() => void reabrir()} disabled={enviando}>
            Reabrir el reclamo
          </button>
        </div>
      ) : null}

      <section className="tarjeta">
        <h2>Conversación</h2>
        {/* RN-14: el comentario interno no llega acá por ninguna vía. La API ni siquiera lo devuelve. */}
        {datos.comments.length === 0 ? <p style={{ color: 'var(--texto-suave)' }}>Todavía no hay mensajes.</p> : null}
        {datos.comments.map((c) => (
          <div key={c.id} style={{ padding: '.55rem 0', borderBottom: '1px solid var(--borde)' }}>
            <p style={{ margin: 0 }}>{c.body}</p>
            <p style={{ margin: '.2rem 0 0', fontSize: '.8rem', color: 'var(--texto-suave)' }}>
              {c.authorName ?? 'Administración'} · {formatDateTime(c.createdAt)}
            </p>
          </div>
        ))}

        <form onSubmit={comentar} style={{ marginTop: '1rem' }}>
          <Campo label="Escribir un mensaje" htmlFor="comentario">
            <textarea id="comentario" value={comentario} onChange={(e) => setComentario(e.target.value)} />
          </Campo>
          <button className="boton" type="submit" disabled={enviando || !comentario.trim()}>Enviar</button>
        </form>
      </section>
    </>
  );
}

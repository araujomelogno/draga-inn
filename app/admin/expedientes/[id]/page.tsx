'use client';

import { use } from 'react';
import { BUILDING_ID } from '@/ui/SesionProvider';
import { useApi } from '@/ui/datos';
import { Esqueleto, ErrorDeRed } from '@/ui/estados';
import { formatDateTime, formatMoney } from '@/shared/format';
import { CASE_STATUS_LABELS, type CaseStatus } from '@/policy/transitions';

type Evento = {
  id: string; eventType: string; entityType: string | null; entityId: string | null;
  actorUserId: string | null; occurredAt: string; note: string | null; payload: Record<string, unknown>;
};
type Detalle = {
  case: { id: string; number: number; title: string; status: CaseStatus; category: string | null; summary: string | null; openedAt: string; closedAt: string | null };
  timeline: Evento[];
  spend: { total: string; currency: string }[];
  authorizations: { id: string; decision: string; approver_role: string; approved_amount: string | null; currency: string | null; decided_at: string; rationale: string | null; is_exception: boolean; exception_reason: string | null; approver_name: string | null }[];
  closureBlockers: { tickets: number; workOrders: number; approvals: number };
  canClose: boolean;
};

const ETIQUETAS: Record<string, string> = {
  case_opened: 'Expediente abierto', case_status_changed: 'Cambio de estado del expediente', case_closed: 'Expediente cerrado',
  ticket_created: 'Ticket creado', ticket_status_changed: 'Cambio de estado del ticket', ticket_comment: 'Comentario',
  ticket_assigned: 'Responsable asignado', quote_submitted: 'Presupuesto cargado', approval_recorded: 'Aprobación',
  governance_exception: 'Excepción de gobernanza', work_order_issued: 'Orden de trabajo emitida',
  work_order_accepted: 'Conformidad registrada', invoice_received: 'Factura recibida', invoice_validated: 'Factura validada',
  document_linked: 'Documento vinculado', decision_recorded: 'Decisión registrada', pool_log_recorded: 'Registro de piscina',
  approved_task_logged: 'Tarea aprobada', incident_logged: 'Incidente', maintenance_task_completed: 'Mantenimiento completado',
};

/** ESPEC §5.4 — Línea de tiempo unificada. RN-02: las excepciones se destacan. */
export default function Expediente({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { datos, cargando, error, recargar } = useApi<Detalle>(BUILDING_ID, `/cases/${id}`);

  if (cargando) return <Esqueleto filas={10} />;
  if (error) return <ErrorDeRed onReintentar={recargar} />;
  if (!datos) return null;

  const c = datos.case;
  const excepciones = datos.authorizations.filter((a) => a.is_exception);

  return (
    <>
      <h1>Expediente #{c.number} · {c.title}</h1>

      {/* El encabezado responde el principio rector: quién, qué, cuándo, por qué, cuánto, con qué autorización */}
      <section className="tarjeta">
        <div className="grilla" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }}>
          <Resumen rotulo="Estado" valor={CASE_STATUS_LABELS[c.status]} />
          <Resumen rotulo="Abierto el" valor={formatDateTime(c.openedAt)} />
          <Resumen rotulo="Categoría" valor={c.category ?? '—'} />
          <Resumen rotulo="Gasto acumulado"
            valor={datos.spend.length === 0 ? '—' : datos.spend.map((s) => formatMoney(s.total, s.currency)).join(' · ')} />
          <Resumen rotulo="Autorizaciones" valor={String(datos.authorizations.length)} />
          {c.closedAt ? <Resumen rotulo="Cerrado el" valor={formatDateTime(c.closedAt)} /> : null}
        </div>
        {c.summary ? <p style={{ marginTop: '1rem' }}>{c.summary}</p> : null}
      </section>

      {/* RN-02 — nunca ocultas */}
      {excepciones.length > 0 ? (
        <div className="aviso ambar">
          <strong>Este expediente tiene {excepciones.length} excepción{excepciones.length > 1 ? 'es' : ''} de gobernanza</strong>
          {excepciones.map((e) => (
            <p key={e.id} style={{ margin: '.35rem 0 0' }}>
              {e.exception_reason} — {e.approver_name ?? 'Sistema'} ({e.approver_role}), {formatDateTime(e.decided_at)}
            </p>
          ))}
        </div>
      ) : null}

      {/* RN-01 — qué falta para cerrar */}
      {!datos.canClose && c.status !== 'closed' ? (
        <div className="aviso info">
          <strong>Todavía no se puede cerrar</strong>
          {[
            datos.closureBlockers.tickets > 0 ? `${datos.closureBlockers.tickets} ticket(s) abierto(s)` : null,
            datos.closureBlockers.workOrders > 0 ? `${datos.closureBlockers.workOrders} orden(es) sin conformidad` : null,
            datos.closureBlockers.approvals > 0 ? `${datos.closureBlockers.approvals} presupuesto(s) sin resolver` : null,
          ].filter(Boolean).join(' · ')}
        </div>
      ) : null}

      <section className="tarjeta">
        <h2>Línea de tiempo</h2>
        <ul className="linea-tiempo">
          {datos.timeline.map((e) => (
            <li key={e.id} className={e.eventType === 'governance_exception' ? 'excepcion' : undefined}>
              <p style={{ margin: 0 }}>
                <span className="quien">{ETIQUETAS[e.eventType] ?? e.eventType}</span>
                {typeof e.payload.amount === 'string' || typeof e.payload.costAmount === 'string' ? (
                  <> · <strong>{formatMoney((e.payload.amount ?? e.payload.costAmount) as string, (e.payload.currency as string) ?? 'UYU')}</strong></>
                ) : null}
              </p>
              {e.note ? <p style={{ margin: '.15rem 0' }}>{e.note}</p> : null}
              <p className="cuando">{formatDateTime(e.occurredAt)}</p>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

function Resumen({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div>
      <p style={{ margin: 0, fontSize: '.78rem', textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--texto-suave)', fontWeight: 700 }}>{rotulo}</p>
      <p style={{ margin: 0, fontWeight: 600 }}>{valor}</p>
    </div>
  );
}

import type { AuthContext, AppRole } from '@/auth/context';
import { TransitionError } from '@/shared/errors';

/** ESPEC §3.1 — Máquina de estados del ticket. */
export type TicketStatus = 'new' | 'triage' | 'assigned' | 'in_progress' | 'waiting_owner' | 'resolved' | 'closed';

export const TICKET_STATUS_LABELS: Record<TicketStatus, string> = {
  new: 'Nuevo',
  triage: 'En triaje',
  assigned: 'Asignado',
  in_progress: 'En curso',
  waiting_owner: 'Esperando al propietario',
  resolved: 'Resuelto',
  closed: 'Cerrado',
};

type Requirement = 'assignee' | 'owner_visible_comment' | 'resolution_note' | 'close_reason';

type Transition = {
  from: TicketStatus;
  to: TicketStatus;
  roles: AppRole[];
  /** `responsable` = el usuario asignado al ticket, sea cual sea su rol. */
  assigneeOnly?: boolean;
  requires?: Requirement[];
  /** RN-12: reapertura por el propietario dentro de la ventana configurada. */
  ownerReopen?: boolean;
};

const ORDER: TicketStatus[] = ['new', 'triage', 'assigned', 'in_progress', 'waiting_owner', 'resolved', 'closed'];

export const TICKET_TRANSITIONS: Transition[] = [
  { from: 'new', to: 'triage', roles: ['administrador', 'encargado'] },
  { from: 'triage', to: 'assigned', roles: ['administrador'], requires: ['assignee'] },
  { from: 'assigned', to: 'in_progress', roles: ['administrador', 'encargado'], assigneeOnly: true },
  { from: 'in_progress', to: 'resolved', roles: ['administrador', 'encargado'], assigneeOnly: true, requires: ['resolution_note'] },
  { from: 'waiting_owner', to: 'in_progress', roles: ['administrador', 'encargado'] },
  { from: 'resolved', to: 'closed', roles: ['administrador'] },
  { from: 'resolved', to: 'in_progress', roles: ['administrador'] },
  { from: 'resolved', to: 'in_progress', roles: ['owner', 'tenant'], ownerReopen: true },
  // `* → waiting_owner` exige comentario visible al propietario
  ...(['new', 'triage', 'assigned', 'in_progress'] as TicketStatus[]).map<Transition>((from) => ({
    from,
    to: 'waiting_owner' as TicketStatus,
    roles: ['administrador', 'encargado'] as AppRole[],
    requires: ['owner_visible_comment'] as Requirement[],
  })),
  // Descartar exige motivo
  ...(['new', 'triage', 'assigned'] as TicketStatus[]).map<Transition>((from) => ({
    from,
    to: 'closed' as TicketStatus,
    roles: ['administrador', 'encargado'] as AppRole[],
    requires: ['close_reason'] as Requirement[],
  })),
];

export type TransitionContext = {
  assignedToUserId: string | null;
  hasAssignee: boolean;
  resolutionNote?: string | null;
  ownerVisibleComment?: string | null;
  closeReason?: string | null;
  /** Motivo del retroceso: obligatorio y solo para administrador. */
  backwardReason?: string | null;
  resolvedAt?: string | null;
  reopenWindowDays: number;
  today: string;
};

const REQUIREMENT_MESSAGES: Record<Requirement, string> = {
  assignee: 'Asigná un responsable antes de pasar el ticket a Asignado.',
  owner_visible_comment: 'Escribí un comentario visible al propietario explicando qué se está esperando.',
  resolution_note: 'Escribí la nota de resolución antes de marcar el ticket como Resuelto.',
  close_reason: 'Indicá el motivo por el que se descarta el ticket.',
};

export type TransitionCheck = { ok: true } | { ok: false; message: string; missing: Requirement[] | 'not_allowed' };

export function checkTicketTransition(
  ctx: AuthContext,
  from: TicketStatus,
  to: TicketStatus,
  tctx: TransitionContext,
): TransitionCheck {
  if (from === to) return { ok: true };

  const isBackward = ORDER.indexOf(to) < ORDER.indexOf(from);
  const candidates = TICKET_TRANSITIONS.filter((t) => t.from === from && t.to === to);

  if (candidates.length === 0) {
    // Retroceso de estado: permitido SOLO a administrador y exige motivo.
    if (isBackward && ctx.roles.includes('administrador')) {
      if (!nonEmpty(tctx.backwardReason)) {
        return { ok: false, message: 'Un retroceso de estado necesita un motivo escrito. Contá por qué volvés atrás.', missing: [] };
      }
      return { ok: true };
    }
    return {
      ok: false,
      message: `No se puede pasar de «${TICKET_STATUS_LABELS[from]}» a «${TICKET_STATUS_LABELS[to]}».`,
      missing: 'not_allowed',
    };
  }

  const failures: string[] = [];
  for (const t of candidates) {
    const roleOk = t.roles.some((r) => ctx.roles.includes(r));
    if (!roleOk) { failures.push('rol'); continue; }

    if (t.assigneeOnly && tctx.assignedToUserId && tctx.assignedToUserId !== ctx.user.id && !ctx.roles.includes('administrador')) {
      failures.push('responsable');
      continue;
    }

    // RN-12: el propietario reabre dentro de la ventana; después abre uno nuevo.
    if (t.ownerReopen) {
      if (!tctx.resolvedAt) { failures.push('ventana'); continue; }
      const days = Math.floor((Date.parse(`${tctx.today}T00:00:00Z`) - Date.parse(tctx.resolvedAt)) / 86_400_000);
      if (days > tctx.reopenWindowDays) {
        return {
          ok: false,
          missing: [],
          message: `Pasaron más de ${tctx.reopenWindowDays} días desde que se resolvió. Abrí un reclamo nuevo y mencioná este número.`,
        };
      }
    }

    const missing = (t.requires ?? []).filter((req) => !requirementMet(req, tctx));
    if (missing.length > 0) {
      return { ok: false, missing, message: missing.map((m) => REQUIREMENT_MESSAGES[m]).join(' ') };
    }
    return { ok: true };
  }

  if (failures.includes('responsable')) {
    return { ok: false, missing: [], message: 'Solo el responsable asignado puede hacer este cambio.' };
  }
  return {
    ok: false,
    missing: 'not_allowed',
    message: `Tu rol no puede pasar el ticket de «${TICKET_STATUS_LABELS[from]}» a «${TICKET_STATUS_LABELS[to]}».`,
  };
}

export function assertTicketTransition(ctx: AuthContext, from: TicketStatus, to: TicketStatus, tctx: TransitionContext): void {
  const r = checkTicketTransition(ctx, from, to, tctx);
  if (!r.ok) throw new TransitionError(r.message, { from, to, missing: r.missing });
}

/** Transiciones que este usuario puede ofrecer en la UI. P3: lo que no puede, no lo ve. */
export function availableTicketTransitions(ctx: AuthContext, from: TicketStatus, tctx: TransitionContext): TicketStatus[] {
  const targets = new Set(TICKET_TRANSITIONS.filter((t) => t.from === from).map((t) => t.to));
  return [...targets].filter((to) => {
    const r = checkTicketTransition(ctx, from, to, { ...tctx, resolutionNote: 'x', ownerVisibleComment: 'x', closeReason: 'x', hasAssignee: true });
    return r.ok;
  });
}

function requirementMet(req: Requirement, tctx: TransitionContext): boolean {
  switch (req) {
    case 'assignee': return tctx.hasAssignee;
    case 'resolution_note': return nonEmpty(tctx.resolutionNote);
    case 'owner_visible_comment': return nonEmpty(tctx.ownerVisibleComment);
    case 'close_reason': return nonEmpty(tctx.closeReason);
  }
}

function nonEmpty(v: string | null | undefined): boolean {
  return typeof v === 'string' && v.trim().length > 0;
}

/** ESPEC §3.2 — Expediente. RN-01 se valida en el módulo de casos. */
export type CaseStatus = 'open' | 'in_progress' | 'waiting' | 'resolved' | 'closed' | 'cancelled';

export const CASE_TRANSITIONS: Record<CaseStatus, CaseStatus[]> = {
  open: ['in_progress', 'waiting', 'resolved', 'cancelled'],
  in_progress: ['waiting', 'resolved', 'cancelled'],
  waiting: ['in_progress', 'resolved', 'cancelled'],
  resolved: ['closed', 'in_progress', 'cancelled'],
  closed: [],
  cancelled: [],
};

export const CASE_STATUS_LABELS: Record<CaseStatus, string> = {
  open: 'Abierto', in_progress: 'En curso', waiting: 'En espera',
  resolved: 'Resuelto', closed: 'Cerrado', cancelled: 'Cancelado',
};

import { eq } from 'drizzle-orm';
import { z } from 'zod';
import type { Tx } from '@/db/tx';
import type { AuthContext } from '@/auth/context';
import { syncReceipts } from '@/db/schema';
import { DomainError } from '@/shared/errors';
import {
  approvedTaskSchema, checklistItemSchema, createTicketSchema,
  incidentSchema, poolLogSchema, stockMovementSchema, ticketCommentSchema,
} from '@/shared/schemas';
import { createTicket, addComment } from '@/modules/tickets/service';
import {
  createApprovedTask, createIncident, createPoolLog, createStockMovement, markChecklistItem,
} from '@/modules/logbook/service';
import { completeTask } from '@/modules/maintenance/service';

export type MutationResult =
  | { clientUuid: string; result: 'applied'; entityType: string; entityId: string; extra?: Record<string, unknown> }
  | { clientUuid: string; result: 'duplicate'; entityType: string; entityId: string }
  | { clientUuid: string; result: 'error'; code: string; message: string };

type Mutation = { clientUuid: string; endpoint: string; method: 'POST' | 'PATCH'; body?: unknown };

/**
 * Procesa un lote de mutaciones offline EN ORDEN y devuelve el resultado por
 * `clientUuid`. La idempotencia real vive en la base (`unique (client_uuid)`
 * + ON CONFLICT DO NOTHING); el recibo solo permite responder rápido al
 * reintento de una mutación ya aplicada.
 *
 * Cada mutación se ejecuta en su propia transacción: un error en la número 3
 * no revierte las dos primeras, y el cliente puede reintentar solo la que falló.
 */
export async function processMutation(tx: Tx, ctx: AuthContext, m: Mutation): Promise<MutationResult> {
  const [receipt] = await tx.select().from(syncReceipts).where(eq(syncReceipts.clientUuid, m.clientUuid)).limit(1);
  if (receipt) {
    return { clientUuid: m.clientUuid, result: 'duplicate', entityType: receipt.entityType ?? '', entityId: receipt.entityId ?? '' };
  }

  try {
    const outcome = await dispatch(tx, ctx, m);
    await tx.insert(syncReceipts).values({
      clientUuid: m.clientUuid,
      buildingId: ctx.buildingId,
      endpoint: m.endpoint,
      entityType: outcome.entityType,
      entityId: outcome.entityId,
      result: outcome.duplicate ? 'duplicate' : 'applied',
    }).onConflictDoNothing();

    return outcome.duplicate
      ? { clientUuid: m.clientUuid, result: 'duplicate', entityType: outcome.entityType, entityId: outcome.entityId }
      : { clientUuid: m.clientUuid, result: 'applied', entityType: outcome.entityType, entityId: outcome.entityId, extra: outcome.extra };
  } catch (err) {
    if (err instanceof DomainError) {
      return { clientUuid: m.clientUuid, result: 'error', code: err.code, message: err.message };
    }
    const pg = err as { code?: string };
    if (pg.code === '23505') {
      return { clientUuid: m.clientUuid, result: 'error', code: 'DUPLICATE', message: 'Ese registro ya existe en el servidor.' };
    }
    throw err;
  }
}

type Outcome = { entityType: string; entityId: string; duplicate: boolean; extra?: Record<string, unknown> };

async function dispatch(tx: Tx, ctx: AuthContext, m: Mutation): Promise<Outcome> {
  const withUuid = (schema: z.ZodTypeAny) => schema.parse({ ...(m.body as object), clientUuid: m.clientUuid });

  // Endpoints aceptados desde la cola offline. Todo lo demás se rechaza:
  // las mutaciones offline son creaciones simples, nunca transiciones que
  // dependan del estado remoto (HANDOFF §6.1).
  if (matches(m.endpoint, '/tickets') && m.method === 'POST') {
    const r = await createTicket(tx, ctx, withUuid(createTicketSchema));
    return { entityType: 'ticket', entityId: r.ticket.id, duplicate: r.duplicate, extra: { number: r.ticket.number } };
  }

  const commentMatch = /\/tickets\/([0-9a-f-]{36})\/comments$/i.exec(m.endpoint);
  if (commentMatch && m.method === 'POST') {
    const c = await addComment(tx, ctx, commentMatch[1]!, withUuid(ticketCommentSchema));
    return { entityType: 'ticket_comment', entityId: c.id, duplicate: false };
  }

  if (matches(m.endpoint, '/pool-logs') && m.method === 'POST') {
    const r = await createPoolLog(tx, ctx, withUuid(poolLogSchema));
    return {
      entityType: 'pool_log', entityId: r.log.id, duplicate: r.duplicate,
      extra: { ticketId: r.ticketId, outOfRange: r.log.outOfRange },
    };
  }

  if (matches(m.endpoint, '/approved-tasks') && m.method === 'POST') {
    const r = await createApprovedTask(tx, ctx, withUuid(approvedTaskSchema));
    return { entityType: 'approved_task_log', entityId: r.log.id, duplicate: r.duplicate, extra: { ticketId: r.ticketId } };
  }

  if (matches(m.endpoint, '/incidents') && m.method === 'POST') {
    const r = await createIncident(tx, ctx, withUuid(incidentSchema));
    return { entityType: 'incident', entityId: r.incident.id, duplicate: r.duplicate };
  }

  if (matches(m.endpoint, '/stock-movements') && m.method === 'POST') {
    const r = await createStockMovement(tx, ctx, withUuid(stockMovementSchema));
    return { entityType: 'stock_movement', entityId: r.movement.id, duplicate: r.duplicate };
  }

  const checklistMatch = /\/checklists\/([0-9a-f-]{36})\/items\/([^/]+)$/i.exec(m.endpoint);
  if (checklistMatch && m.method === 'POST') {
    const r = await markChecklistItem(tx, ctx, checklistMatch[1]!, decodeURIComponent(checklistMatch[2]!), withUuid(checklistItemSchema));
    return { entityType: 'checklist_item_result', entityId: r.instanceId, duplicate: false, extra: { status: r.status, progress: r.progress } };
  }

  const taskMatch = /\/maintenance\/tasks\/([0-9a-f-]{36})\/complete$/i.exec(m.endpoint);
  if (taskMatch && m.method === 'POST') {
    const body = (m.body ?? {}) as { notes?: string | null; costAmount?: string | null };
    const t = await completeTask(tx, ctx, taskMatch[1]!, { ...body, clientUuid: m.clientUuid });
    return { entityType: 'maintenance_task', entityId: t.id, duplicate: false };
  }

  throw new DomainError('UNSUPPORTED_ENDPOINT', `La operación «${m.endpoint}» no se puede sincronizar desde la app.`, 422);
}

function matches(endpoint: string, suffix: string): boolean {
  return endpoint.endsWith(suffix);
}

/** CB-03: los tickets críticos se envían primero cuando la cola se acumula. */
export function prioritize(mutations: Mutation[]): Mutation[] {
  const weight = (m: Mutation): number => {
    const body = m.body as { priority?: string; incidentType?: string } | null;
    if (body?.incidentType === 'accident' || body?.incidentType === 'fire_start') return 0;
    if (body?.priority === 'critical') return 1;
    if (m.endpoint.endsWith('/tickets')) return 2;
    return 3;
  };
  return [...mutations].sort((a, b) => weight(a) - weight(b));
}

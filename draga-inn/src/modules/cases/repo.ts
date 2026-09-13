import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import type { Tx } from '@/db/tx';
import { nextNumber } from '@/db/tx';
import type { AuthContext } from '@/auth/context';
import { caseEvents, cases } from '@/db/schema';
import type { CaseEventType } from '@/db/schema/cases';
import { ConflictError, NotFoundError } from '@/shared/errors';
import { CASE_TRANSITIONS, type CaseStatus } from '@/policy/transitions';

/**
 * Regla 1: todo hecho pertenece a un expediente.
 * Ninguna entidad de dominio se crea suelta: si no hay `caseId`, se abre uno.
 */
export async function openCase(
  tx: Tx,
  ctx: AuthContext,
  input: { title: string; category?: string; unitId?: string | null; assetId?: string | null; summary?: string | null },
): Promise<typeof cases.$inferSelect> {
  const number = await nextNumber(tx, ctx.buildingId, 'cases');
  const [row] = await tx
    .insert(cases)
    .values({
      buildingId: ctx.buildingId,
      number,
      title: input.title,
      category: input.category ?? null,
      unitId: input.unitId ?? null,
      assetId: input.assetId ?? null,
      summary: input.summary ?? null,
      openedBy: ctx.user.id,
      createdBy: ctx.user.id,
    })
    .returning();

  await appendEvent(tx, ctx, {
    caseId: row!.id,
    eventType: 'case_opened',
    entityType: 'case',
    entityId: row!.id,
    note: input.title,
  });
  return row!;
}

/** La línea de tiempo es append-only: nunca UPDATE, nunca DELETE. */
export async function appendEvent(
  tx: Tx,
  ctx: AuthContext,
  input: {
    caseId: string;
    eventType: CaseEventType;
    entityType?: string | null;
    entityId?: string | null;
    note?: string | null;
    payload?: Record<string, unknown>;
  },
): Promise<void> {
  await tx.insert(caseEvents).values({
    buildingId: ctx.buildingId,
    caseId: input.caseId,
    eventType: input.eventType,
    entityType: input.entityType ?? null,
    entityId: input.entityId ?? null,
    actorUserId: ctx.user.id,
    note: input.note ?? null,
    payload: input.payload ?? {},
  });
}

export async function getCase(tx: Tx, ctx: AuthContext, caseId: string) {
  const [row] = await tx
    .select()
    .from(cases)
    .where(and(eq(cases.id, caseId), eq(cases.buildingId, ctx.buildingId)))
    .limit(1);
  if (!row) throw new NotFoundError('No encontramos el expediente.');
  return row;
}

/** RN-01: un expediente no cierra con tickets, órdenes de trabajo o aprobaciones pendientes. */
export type ClosureBlockers = { tickets: number; workOrders: number; approvals: number };

export async function closureBlockers(tx: Tx, ctx: AuthContext, caseId: string): Promise<ClosureBlockers> {
  const { rows } = await tx.execute(sql`
    select
      (select count(*) from tickets
        where case_id = ${caseId} and building_id = ${ctx.buildingId}
          and status not in ('closed'))::int as tickets,
      (select count(*) from work_orders
        where case_id = ${caseId} and building_id = ${ctx.buildingId}
          and status not in ('accepted','cancelled'))::int as work_orders,
      (select count(*) from quotes q
        where q.case_id = ${caseId} and q.building_id = ${ctx.buildingId}
          and q.status = 'submitted'
          and not exists (
            select 1 from approvals a where a.subject_type = 'quote' and a.subject_id = q.id
          ))::int as approvals
  `);
  const r = rows[0] as { tickets: number; work_orders: number; approvals: number };
  return { tickets: r.tickets, workOrders: r.work_orders, approvals: r.approvals };
}

export function blockersMessage(b: ClosureBlockers): string | null {
  const parts: string[] = [];
  if (b.tickets > 0) parts.push(`${b.tickets} ${b.tickets === 1 ? 'ticket abierto' : 'tickets abiertos'}`);
  if (b.workOrders > 0) parts.push(`${b.workOrders} ${b.workOrders === 1 ? 'orden de trabajo sin conformidad' : 'órdenes de trabajo sin conformidad'}`);
  if (b.approvals > 0) parts.push(`${b.approvals} ${b.approvals === 1 ? 'presupuesto sin resolver' : 'presupuestos sin resolver'}`);
  if (parts.length === 0) return null;
  return `Para cerrar el expediente resolvé primero: ${parts.join(', ')}.`;
}

export async function changeCaseStatus(
  tx: Tx,
  ctx: AuthContext,
  caseId: string,
  to: CaseStatus,
  note?: string,
): Promise<void> {
  const current = await getCase(tx, ctx, caseId);
  const from = current.status as CaseStatus;
  if (from === to) return;

  if (!CASE_TRANSITIONS[from].includes(to)) {
    throw new ConflictError(`El expediente no puede pasar de «${from}» a «${to}».`);
  }
  if (to === 'closed') {
    const blockers = await closureBlockers(tx, ctx, caseId);
    const msg = blockersMessage(blockers);
    // RN-01
    if (msg) throw new ConflictError(msg, { blockers });
  }

  await tx
    .update(cases)
    .set({ status: to, closedAt: to === 'closed' ? new Date() : null })
    .where(and(eq(cases.id, caseId), eq(cases.buildingId, ctx.buildingId)));

  await appendEvent(tx, ctx, {
    caseId,
    eventType: to === 'closed' ? 'case_closed' : 'case_status_changed',
    entityType: 'case',
    entityId: caseId,
    note: note ?? null,
    payload: { from, to },
  });
}

/** ESPEC §5.4 — línea de tiempo unificada, en orden cronológico. */
export async function caseTimeline(tx: Tx, ctx: AuthContext, caseId: string) {
  return tx
    .select({
      id: caseEvents.id,
      eventType: caseEvents.eventType,
      entityType: caseEvents.entityType,
      entityId: caseEvents.entityId,
      actorUserId: caseEvents.actorUserId,
      occurredAt: caseEvents.occurredAt,
      note: caseEvents.note,
      payload: caseEvents.payload,
    })
    .from(caseEvents)
    .where(and(eq(caseEvents.caseId, caseId), eq(caseEvents.buildingId, ctx.buildingId)))
    .orderBy(caseEvents.occurredAt);
}

export async function listCases(tx: Tx, ctx: AuthContext, opts: { status?: CaseStatus[]; limit: number; offset: number }) {
  const where = [eq(cases.buildingId, ctx.buildingId)];
  if (opts.status?.length) where.push(inArray(cases.status, opts.status));
  return tx.select().from(cases).where(and(...where)).orderBy(desc(cases.openedAt)).limit(opts.limit).offset(opts.offset);
}

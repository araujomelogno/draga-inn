import { and, asc, eq, inArray, sql, type SQL } from 'drizzle-orm';
import type { Tx } from '@/db/tx';
import type { AuthContext } from '@/auth/context';
import { assets, maintenancePlans, maintenanceTasks } from '@/db/schema';
import { appendEvent, openCase } from '@/modules/cases/repo';
import { assertCan } from '@/policy/can';
import { ConflictError, NotFoundError, ValidationError } from '@/shared/errors';
import { addDays, addMonths, diffDays, localDate } from '@/shared/dates';

/** Avance de una frecuencia. Es la base del job `generate-maintenance-tasks`. */
export function nextDue(freq: string, from: string, intervalCount: number): string {
  switch (freq) {
    case 'daily': return addDays(from, intervalCount);
    case 'weekly': return addDays(from, 7 * intervalCount);
    case 'monthly': case 'seasonal': return addMonths(from, intervalCount);
    case 'quarterly': return addMonths(from, 3 * intervalCount);
    case 'biannual': return addMonths(from, 6 * intervalCount);
    case 'annual': return addMonths(from, 12 * intervalCount);
    default: return addMonths(from, intervalCount);
  }
}

/**
 * Materializa las tareas de un plan en la ventana pedida.
 * Idempotente: `unique (plan_id, due_date)` + ON CONFLICT DO NOTHING, así que
 * reejecutar el job no duplica nada (CB-13).
 */
export async function materializePlan(
  tx: Tx,
  ctx: AuthContext,
  plan: typeof maintenancePlans.$inferSelect,
  horizonDays: number,
  today: string,
): Promise<number> {
  const horizon = addDays(today, horizonDays);
  let due = plan.startDate;
  // Avanzar hasta la primera fecha dentro de la ventana
  let guard = 0;
  while (due < today && guard++ < 10_000) due = nextDue(plan.freq, due, plan.intervalCount);

  const values: (typeof maintenanceTasks.$inferInsert)[] = [];
  while (due <= horizon && values.length < 500) {
    values.push({
      buildingId: ctx.buildingId,
      planId: plan.id,
      assetId: plan.assetId,
      title: plan.name,
      dueDate: due,
      assignedToUserId: plan.defaultAssigneeId,
      createdBy: ctx.user.id,
    });
    due = nextDue(plan.freq, due, plan.intervalCount);
  }
  if (values.length === 0) return 0;

  const inserted = await tx.insert(maintenanceTasks).values(values)
    .onConflictDoNothing({ target: [maintenanceTasks.planId, maintenanceTasks.dueDate] })
    .returning({ id: maintenanceTasks.id });
  return inserted.length;
}

export async function listTasks(
  tx: Tx,
  ctx: AuthContext,
  f: { dueBefore?: string; from?: string; to?: string; status?: string[]; assigneeId?: string; limit: number; offset: number },
) {
  assertCan(ctx, 'read', 'maintenance_task');
  const where: SQL[] = [eq(maintenanceTasks.buildingId, ctx.buildingId)];
  if (f.dueBefore) where.push(sql`${maintenanceTasks.dueDate} <= ${f.dueBefore}::date`);
  if (f.from) where.push(sql`${maintenanceTasks.dueDate} >= ${f.from}::date`);
  if (f.to) where.push(sql`${maintenanceTasks.dueDate} <= ${f.to}::date`);
  if (f.status?.length) where.push(inArray(maintenanceTasks.status, f.status as ('pending'|'done'|'overdue'|'skipped')[]));
  if (f.assigneeId) where.push(eq(maintenanceTasks.assignedToUserId, f.assigneeId));

  return tx
    .select({
      id: maintenanceTasks.id, title: maintenanceTasks.title, dueDate: maintenanceTasks.dueDate,
      status: maintenanceTasks.status, assetId: maintenanceTasks.assetId, assetName: assets.name,
      assignedToUserId: maintenanceTasks.assignedToUserId, planId: maintenanceTasks.planId,
      notes: maintenanceTasks.notes,
      isOverdue: sql<boolean>`${maintenanceTasks.dueDate} < current_date and ${maintenanceTasks.status} = 'pending'`,
    })
    .from(maintenanceTasks)
    .leftJoin(assets, eq(assets.id, maintenanceTasks.assetId))
    .where(and(...where))
    // Vencidas primero, luego por fecha (ESPEC §4.1)
    .orderBy(asc(maintenanceTasks.dueDate))
    .limit(f.limit)
    .offset(f.offset);
}

export async function completeTask(
  tx: Tx,
  ctx: AuthContext,
  taskId: string,
  input: { notes?: string | null; costAmount?: string | null; currency?: string | null; budgetCategoryId?: string | null; clientUuid?: string },
) {
  assertCan(ctx, 'update', 'maintenance_task');

  const [task] = await tx.select().from(maintenanceTasks)
    .where(and(eq(maintenanceTasks.id, taskId), eq(maintenanceTasks.buildingId, ctx.buildingId))).limit(1);
  if (!task) throw new NotFoundError('No encontramos la tarea.');
  if (task.status === 'done') return task;

  // Regla 1: el hecho necesita expediente si va a llevar costo.
  let caseId = task.caseId;
  if (!caseId && input.costAmount) {
    caseId = (await openCase(tx, ctx, { title: `Mantenimiento — ${task.title}`, category: 'mantenimiento', assetId: task.assetId })).id;
  }

  const [updated] = await tx.update(maintenanceTasks).set({
    status: 'done',
    completedAt: new Date(),
    completedByUserId: ctx.user.id,
    notes: input.notes ?? task.notes,
    caseId,
    // Regla 4: monto, moneda y rubro aunque el v1 no calcule expensas.
    costAmount: input.costAmount ?? task.costAmount,
    currency: input.currency ?? (input.costAmount ? ctx.buildingCurrency : task.currency),
    budgetCategoryId: input.budgetCategoryId ?? task.budgetCategoryId,
  }).where(eq(maintenanceTasks.id, taskId)).returning();

  if (caseId) {
    await appendEvent(tx, ctx, {
      caseId, eventType: 'maintenance_task_completed', entityType: 'maintenance_task', entityId: taskId,
      note: task.title, payload: { dueDate: task.dueDate, costAmount: input.costAmount ?? null },
    });
  }
  return updated!;
}

/** `pending → skipped` exige motivo (§3.4). */
export async function skipTask(tx: Tx, ctx: AuthContext, taskId: string, reason: string) {
  assertCan(ctx, 'update', 'maintenance_task');
  if (!reason.trim()) throw new ValidationError('Contá por qué se saltea la tarea.');

  const [updated] = await tx.update(maintenanceTasks)
    .set({ status: 'skipped', skipReason: reason, completedByUserId: ctx.user.id, completedAt: new Date() })
    .where(and(eq(maintenanceTasks.id, taskId), eq(maintenanceTasks.buildingId, ctx.buildingId)))
    .returning();
  if (!updated) throw new NotFoundError('No encontramos la tarea.');
  return updated;
}

/**
 * RN-28 — No se desactiva un plan con tareas pendientes sin decidir qué hacer.
 * `pendingAction` es explícito: 'cancel' o 'keep'.
 */
export async function deactivatePlan(tx: Tx, ctx: AuthContext, planId: string, pendingAction?: 'cancel' | 'keep') {
  assertCan(ctx, 'update', 'maintenance_plan');

  const [{ pending }] = (await tx
    .select({ pending: sql<number>`count(*)::int` })
    .from(maintenanceTasks)
    .where(and(eq(maintenanceTasks.planId, planId), sql`${maintenanceTasks.status} in ('pending','overdue')`))) as [{ pending: number }];

  if (pending > 0 && !pendingAction) {
    throw new ConflictError(
      `Este plan tiene ${pending} ${pending === 1 ? 'tarea pendiente' : 'tareas pendientes'}. ` +
        'Decidí qué hacer con ellas: cancelarlas o dejarlas abiertas.',
      { pending, options: ['cancel', 'keep'] },
    );
  }

  if (pendingAction === 'cancel') {
    await tx.update(maintenanceTasks)
      .set({ status: 'skipped', skipReason: 'Plan de mantenimiento desactivado.' })
      .where(and(eq(maintenanceTasks.planId, planId), sql`${maintenanceTasks.status} in ('pending','overdue')`));
  }

  const [plan] = await tx.update(maintenancePlans).set({ active: false })
    .where(and(eq(maintenancePlans.id, planId), eq(maintenancePlans.buildingId, ctx.buildingId))).returning();
  if (!plan) throw new NotFoundError('No encontramos el plan.');
  return { plan, pendingHandled: pendingAction ?? 'none', pending };
}

/** Ficha de activo: historial, costo acumulado, plan preventivo. */
export async function assetDetail(tx: Tx, ctx: AuthContext, assetId: string) {
  assertCan(ctx, 'read', 'asset');
  const [asset] = await tx.select().from(assets)
    .where(and(eq(assets.id, assetId), eq(assets.buildingId, ctx.buildingId))).limit(1);
  if (!asset) throw new NotFoundError('No encontramos el activo.');

  const { rows: history } = await tx.execute(sql`
    select 'asset_event' as kind, id, event_type as label, occurred_at, description, cost_amount, currency
      from asset_events where asset_id = ${assetId}
    union all
    select 'task', id, title, completed_at, notes, cost_amount, currency
      from maintenance_tasks where asset_id = ${assetId} and status = 'done'
    order by occurred_at desc nulls last limit 200
  `);

  const { rows: totals } = await tx.execute(sql`
    select coalesce(sum(cost_amount), 0)::numeric(14,2) as total, currency
      from (
        select cost_amount, currency from asset_events where asset_id = ${assetId}
        union all
        select cost_amount, currency from maintenance_tasks where asset_id = ${assetId}
      ) s where cost_amount is not null group by currency
  `);

  const plans = await tx.select().from(maintenancePlans)
    .where(and(eq(maintenancePlans.assetId, assetId), eq(maintenancePlans.buildingId, ctx.buildingId)));

  const today = localDate(new Date(), ctx.buildingTimezone);
  return {
    asset,
    plans,
    history,
    accumulatedCost: totals,
    warrantyDaysLeft: asset.warrantyUntil ? diffDays(today, asset.warrantyUntil) : null,
  };
}

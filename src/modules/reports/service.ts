import { and, eq, sql } from 'drizzle-orm';
import type { Tx } from '@/db/tx';
import type { AuthContext } from '@/auth/context';
import { monthlyReports } from '@/db/schema';
import type { MonthlyReportContent } from '@/db/schema/logbook';
import { assertCan } from '@/policy/can';
import { ConflictError, NotFoundError, ValidationError } from '@/shared/errors';
import { endOfMonth, localDate, startOfMonth } from '@/shared/dates';
import { formatMonth } from '@/shared/format';
import { poolSeasonActive } from '@/shared/season';
import { enqueue } from '@/modules/notifications/outbox';
import { complianceOverview } from '@/modules/compliance/service';

/**
 * Arma los agregados del mes. Lo usa el job `generate-monthly-report` y la
 * vista previa en construcción de la PWA (ESPEC §4.7).
 *
 * CB-10: si el mes cerró sin actividad, el informe se genera igual e indica
 * explícitamente qué bloques quedaron sin datos.
 */
export async function buildContent(tx: Tx, ctx: AuthContext, periodMonth: string): Promise<MonthlyReportContent> {
  const from = startOfMonth(periodMonth);
  const to = endOfMonth(periodMonth);

  const { rows } = await tx.execute(sql`
    select
      (select count(*) from tickets where building_id = ${ctx.buildingId}
         and created_at >= ${from}::date and created_at < (${to}::date + 1))::int as tickets_opened,
      (select count(*) from tickets where building_id = ${ctx.buildingId}
         and closed_at >= ${from}::date and closed_at < (${to}::date + 1))::int as tickets_closed,
      (select count(*) from tickets where building_id = ${ctx.buildingId} and status <> 'closed')::int as tickets_open,
      (select count(*) from maintenance_tasks where building_id = ${ctx.buildingId}
         and due_date between ${from}::date and ${to}::date)::int as tasks_planned,
      (select count(*) from maintenance_tasks where building_id = ${ctx.buildingId}
         and due_date between ${from}::date and ${to}::date and status = 'done')::int as tasks_done,
      (select count(*) from maintenance_tasks where building_id = ${ctx.buildingId}
         and due_date between ${from}::date and ${to}::date and status in ('pending','overdue'))::int as tasks_pending,
      (select count(*) from maintenance_tasks where building_id = ${ctx.buildingId}
         and due_date between ${from}::date and ${to}::date and status = 'overdue')::int as tasks_overdue,
      (select count(*) from pool_logs where building_id = ${ctx.buildingId}
         and logged_on between ${from}::date and ${to}::date)::int as pool_logged,
      (select count(*) from pool_logs where building_id = ${ctx.buildingId}
         and logged_on between ${from}::date and ${to}::date and out_of_range)::int as pool_out_of_range,
      (select count(*) from approved_task_logs where building_id = ${ctx.buildingId}
         and performed_on between ${from}::date and ${to}::date)::int as approved_total,
      (select count(*) from approved_task_logs where building_id = ${ctx.buildingId}
         and performed_on between ${from}::date and ${to}::date and escalated)::int as approved_escalated,
      (select count(*) from incidents where building_id = ${ctx.buildingId}
         and occurred_at >= ${from}::date and occurred_at < (${to}::date + 1))::int as incidents_total
  `);
  const k = rows[0] as Record<string, number>;

  const { rows: byCategory } = await tx.execute(sql`
    select category, count(*)::int as n from tickets
     where building_id = ${ctx.buildingId} and created_at >= ${from}::date and created_at < (${to}::date + 1)
     group by category`);
  const { rows: byTrade } = await tx.execute(sql`
    select trade::text as trade, count(*)::int as n from approved_task_logs
     where building_id = ${ctx.buildingId} and performed_on between ${from}::date and ${to}::date
     group by trade`);
  const { rows: byIncident } = await tx.execute(sql`
    select incident_type::text as t, count(*)::int as n from incidents
     where building_id = ${ctx.buildingId} and occurred_at >= ${from}::date and occurred_at < (${to}::date + 1)
     group by incident_type`);
  const { rows: spend } = await tx.execute(sql`
    select coalesce(bc.name, 'Sin rubro') as category, v.currency, sum(v.total)::numeric(14,2) as total
      from v_monthly_spend v left join budget_categories bc on bc.id = v.budget_category_id
     where v.building_id = ${ctx.buildingId} and v.period = ${from}::date
     group by bc.name, v.currency`);
  const { rows: lowStock } = await tx.execute(sql`
    select name from stock_items where building_id = ${ctx.buildingId} and current_quantity < min_quantity`);

  // RN-50: resumen de control — previstas, completadas, pendientes, % y justificación.
  const compliance = await complianceOverview(tx, ctx, { period: 'month', from, to, calendarDays: 31 });

  // RN-52: la expectativa de registro de piscina solo corre en temporada.
  let poolExpected = 0;
  for (let d = from; d <= to; d = nextDay(d)) if (poolSeasonActive(d, ctx.buildingSettings)) poolExpected += 1;

  const spendByCategory: Record<string, string> = {};
  let spendTotal = 0;
  let spendCurrency = ctx.buildingCurrency;
  for (const r of spend as { category: string; currency: string; total: string }[]) {
    spendByCategory[r.category] = r.total;
    spendTotal += Number(r.total);
    spendCurrency = r.currency;
  }

  const emptyBlocks: string[] = [];
  if (k.tickets_opened === 0 && k.tickets_closed === 0) emptyBlocks.push('Reclamos');
  if (k.tasks_planned === 0) emptyBlocks.push('Mantenimiento preventivo');
  if (k.pool_logged === 0) emptyBlocks.push(poolExpected > 0 ? 'Piscina (sin registros en temporada)' : 'Piscina (fuera de temporada)');
  if (k.approved_total === 0) emptyBlocks.push('Tareas aprobadas');
  if (k.incidents_total === 0) emptyBlocks.push('Incidentes');
  if (spend.length === 0) emptyBlocks.push('Gasto');

  return {
    tickets: {
      opened: k.tickets_opened!, closed: k.tickets_closed!, open: k.tickets_open!,
      byCategory: Object.fromEntries((byCategory as { category: string; n: number }[]).map((r) => [r.category, r.n])),
    },
    maintenance: { planned: k.tasks_planned!, done: k.tasks_done!, pending: k.tasks_pending!, overdue: k.tasks_overdue! },
    control: {
      planned: compliance.requiredItems,
      completed: compliance.completedItems,
      pending: compliance.requiredItems - compliance.completedItems,
      compliancePct: compliance.compliancePct,
    },
    pool: {
      logged: k.pool_logged!, expected: poolExpected, outOfRange: k.pool_out_of_range!,
      // RN-43: faltante es una categoría propia, no un cero.
      missing: Math.max(0, poolExpected - k.pool_logged!),
    },
    approvedTasks: {
      total: k.approved_total!,
      byTrade: Object.fromEntries((byTrade as { trade: string; n: number }[]).map((r) => [r.trade, r.n])),
      escalationPct: k.approved_total! === 0 ? 0 : Math.round((k.approved_escalated! / k.approved_total!) * 10000) / 100,
    },
    incidents: {
      total: k.incidents_total!,
      byType: Object.fromEntries((byIncident as { t: string; n: number }[]).map((r) => [r.t, r.n])),
    },
    spend: { total: spendTotal.toFixed(2), currency: spendCurrency, byCategory: spendByCategory },
    stock: { belowMinimum: (lowStock as { name: string }[]).map((r) => r.name) },
    emptyBlocks,
  };
}

function nextDay(d: string): string {
  const dt = new Date(`${d}T00:00:00Z`);
  dt.setUTCDate(dt.getUTCDate() + 1);
  return dt.toISOString().slice(0, 10);
}

/** Genera (o regenera) el borrador del mes. Idempotente por (building, period, version). */
export async function generateDraft(tx: Tx, ctx: AuthContext, periodMonth: string) {
  const period = startOfMonth(periodMonth);
  const content = await buildContent(tx, ctx, period);

  const [existing] = await tx
    .select()
    .from(monthlyReports)
    .where(and(eq(monthlyReports.buildingId, ctx.buildingId), eq(monthlyReports.periodMonth, period)))
    .orderBy(sql`version desc`)
    .limit(1);

  // RN-42: un informe enviado no se edita. Si ya se envió, no lo tocamos.
  if (existing?.status === 'submitted') return existing;

  if (existing) {
    const [updated] = await tx.update(monthlyReports)
      .set({ content, generatedAt: new Date() }).where(eq(monthlyReports.id, existing.id)).returning();
    return updated!;
  }

  const [created] = await tx.insert(monthlyReports).values({
    buildingId: ctx.buildingId, periodMonth: period, version: 1, content, createdBy: ctx.user.id,
  }).returning();
  return created!;
}

export async function getReport(tx: Tx, ctx: AuthContext, periodMonth: string) {
  assertCan(ctx, 'read', 'monthly_report');
  const period = startOfMonth(periodMonth);
  const [row] = await tx.select().from(monthlyReports)
    .where(and(eq(monthlyReports.buildingId, ctx.buildingId), eq(monthlyReports.periodMonth, period)))
    .orderBy(sql`version desc`).limit(1);
  return row ?? null;
}

/** ESPEC §4.7 — vista previa en construcción del mes en curso. */
export async function preview(tx: Tx, ctx: AuthContext, periodMonth: string) {
  assertCan(ctx, 'read', 'monthly_report');
  const period = startOfMonth(periodMonth);
  const stored = await getReport(tx, ctx, period);
  const content = stored?.status === 'submitted' ? stored.content : await buildContent(tx, ctx, period);
  const today = localDate(new Date(), ctx.buildingTimezone);

  return {
    period,
    periodLabel: formatMonth(period),
    content,
    narrative: stored?.narrative ?? null,
    controlJustification: stored?.controlJustification ?? null,
    status: stored?.status ?? 'draft',
    version: stored?.version ?? 1,
    // RN-41: enviable a partir del día 1 del mes siguiente.
    canSubmit: today >= nextMonthFirstDay(period) && stored?.status !== 'submitted',
    submitAvailableFrom: nextMonthFirstDay(period),
  };
}

function nextMonthFirstDay(period: string): string {
  const [y, m] = period.split('-').map(Number);
  const d = new Date(Date.UTC(y ?? 1970, m ?? 1, 1));
  return d.toISOString().slice(0, 10);
}

export async function saveNarrative(tx: Tx, ctx: AuthContext, periodMonth: string, narrative: string | null, controlJustification: string | null) {
  assertCan(ctx, 'update', 'monthly_report');
  const report = (await getReport(tx, ctx, periodMonth)) ?? (await generateDraft(tx, ctx, periodMonth));
  if (report.status === 'submitted') {
    throw new ConflictError(`El informe de ${formatMonth(report.periodMonth)} ya fue enviado. Generá una versión nueva si necesitás corregirlo.`);
  }
  const [updated] = await tx.update(monthlyReports)
    .set({ narrative, controlJustification }).where(eq(monthlyReports.id, report.id)).returning();
  return updated!;
}

/** RN-41 + RN-42. */
export async function submitReport(tx: Tx, ctx: AuthContext, periodMonth: string, input: { narrative?: string | null; controlJustification?: string | null }) {
  assertCan(ctx, 'update', 'monthly_report');
  const period = startOfMonth(periodMonth);
  const today = localDate(new Date(), ctx.buildingTimezone);

  if (today < nextMonthFirstDay(period)) {
    throw new ValidationError(
      `El informe de ${formatMonth(period)} se puede enviar a partir del ${nextMonthFirstDay(period).split('-').reverse().join('/')}.`,
    );
  }

  const existing = await getReport(tx, ctx, period);
  if (!existing) throw new NotFoundError('Todavía no se generó el informe de ese mes.');

  if (existing.status === 'submitted') {
    throw new ConflictError(
      `El informe de ${formatMonth(period)} ya fue enviado el ${existing.submittedAt?.toISOString().slice(0, 10)}. ` +
        'Para corregirlo, generá una versión nueva.',
      { version: existing.version },
    );
  }

  const [submitted] = await tx.update(monthlyReports).set({
    status: 'submitted',
    submittedAt: new Date(),
    submittedBy: ctx.user.id,
    narrative: input.narrative ?? existing.narrative,
    controlJustification: input.controlJustification ?? existing.controlJustification,
  }).where(eq(monthlyReports.id, existing.id)).returning();

  await enqueue(tx, ctx.buildingId, 'report.monthly_ready', { period, version: submitted!.version });
  return submitted!;
}

/** RN-42 — La corrección es una versión nueva que referencia a la anterior. */
export async function newVersion(tx: Tx, ctx: AuthContext, periodMonth: string) {
  assertCan(ctx, 'create', 'monthly_report');
  const period = startOfMonth(periodMonth);
  const previous = await getReport(tx, ctx, period);
  if (!previous) throw new NotFoundError('No hay un informe previo para ese mes.');
  if (previous.status !== 'submitted') return previous;

  const content = await buildContent(tx, ctx, period);
  const [created] = await tx.insert(monthlyReports).values({
    buildingId: ctx.buildingId,
    periodMonth: period,
    version: previous.version + 1,
    supersedesId: previous.id,
    content,
    narrative: previous.narrative,
    controlJustification: previous.controlJustification,
    createdBy: ctx.user.id,
  }).returning();
  return created!;
}

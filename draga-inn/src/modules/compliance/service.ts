import { and, asc, desc, eq, gte, lte, sql } from 'drizzle-orm';
import type { Tx } from '@/db/tx';
import type { AuthContext } from '@/auth/context';
import { checklistInstances, checklistItemResults, checklistTemplates, complianceSnapshots, poolLogs } from '@/db/schema';
import type { ChecklistItem } from '@/db/schema/logbook';
import { assertCan } from '@/policy/can';
import { addDays, diffDays, localDate, startOfMonth } from '@/shared/dates';
import { poolSeasonActive, seasonFor } from '@/shared/season';
import { detectTrend, POOL_PARAMS, poolRanges, type PoolParam } from '@/shared/pool';
import { periodKey } from '@/modules/logbook/service';

/**
 * RN-51 — Encuadre obligatorio.
 *
 * Esta métrica mide el CUMPLIMIENTO DEL PLAN DEL EDIFICIO. No es, ni se rotula
 * como, desempeño de una persona. La leyenda viaja con el dato: toda respuesta
 * de esta API la incluye para que ninguna pantalla pueda mostrar el número sin
 * el encuadre.
 */
export const COMPLIANCE_FRAMING = {
  title: 'Cumplimiento del plan del edificio',
  legend:
    'Estos indicadores miden el cumplimiento del plan operativo del edificio, no el desempeño de una persona. ' +
    'Su uso con fines disciplinarios requiere el procedimiento previsto en el régimen de faltas y sanciones.',
} as const;

export type DayStatus = 'complete' | 'partial' | 'missing';

export type DayCompliance = {
  date: string;
  requiredItems: number;
  completedItems: number;
  compliancePct: number;
  dayStatus: DayStatus;
  /** RN-52: null = fuera de temporada de piscina. No cuenta como faltante. */
  poolLogged: boolean | null;
  poolOutOfRange: boolean | null;
  missingItemKeys: string[];
};

/**
 * Calcula el cumplimiento de un día. Es la función que usa el job
 * `compute-compliance` y también la lectura en vivo.
 *
 * RN-43 — Tres estados distintos, y se computan distinto:
 *   · presente y correcto  → cuenta como cumplido
 *   · presente fuera de rango → cuenta como cumplido (el dato SE REGISTRÓ)
 *     pero se marca aparte para el análisis de calidad
 *   · faltante → no cuenta como cumplido
 */
export async function computeDay(tx: Tx, ctx: AuthContext, date: string): Promise<DayCompliance> {
  const isHigh = seasonFor(date, ctx.buildingSettings).isHigh;

  const templates = await tx
    .select()
    .from(checklistTemplates)
    .where(and(eq(checklistTemplates.buildingId, ctx.buildingId), eq(checklistTemplates.active, true)));

  // Solo lo que efectivamente vence ese día
  const applicable = templates.filter((t) => (t.seasonal || t.freq === 'seasonal' ? isHigh : true));

  let requiredItems = 0;
  let completedItems = 0;
  const missingItemKeys: string[] = [];

  for (const t of applicable) {
    const key = periodKey(t.freq, date);
    // Una plantilla no diaria solo se evalúa el día en que cierra su período
    if (t.freq !== 'daily' && key !== periodKey(t.freq, date)) continue;
    if (t.freq !== 'daily' && !isPeriodClosingDay(t.freq, date)) continue;

    const [instance] = await tx
      .select({ id: checklistInstances.id })
      .from(checklistInstances)
      .where(and(eq(checklistInstances.templateId, t.id), eq(checklistInstances.periodDate, key)))
      .limit(1);

    // RN-48: solo ítems requeridos. Los opcionales no penalizan.
    const required = (t.items as ChecklistItem[]).filter((i) => i.required && (!i.seasonal || isHigh));
    requiredItems += required.length;

    if (!instance) {
      missingItemKeys.push(...required.map((i) => `${t.name}: ${i.label}`));
      continue;
    }

    const results = await tx
      .select({ itemKey: checklistItemResults.itemKey, done: checklistItemResults.done })
      .from(checklistItemResults)
      .where(eq(checklistItemResults.instanceId, instance.id));

    const doneKeys = new Set(results.filter((r) => r.done).map((r) => r.itemKey));
    for (const item of required) {
      if (doneKeys.has(item.key)) completedItems += 1;
      else missingItemKeys.push(`${t.name}: ${item.label}`);
    }
  }

  // RN-52: el registro de piscina solo cuenta en temporada.
  const poolRequired = poolSeasonActive(date, ctx.buildingSettings);
  let poolLogged: boolean | null = null;
  let poolOutOfRange: boolean | null = null;

  if (poolRequired) {
    const [log] = await tx
      .select({ id: poolLogs.id, outOfRange: poolLogs.outOfRange })
      .from(poolLogs)
      .where(and(eq(poolLogs.buildingId, ctx.buildingId), eq(poolLogs.loggedOn, date)))
      .limit(1);
    poolLogged = Boolean(log);
    poolOutOfRange = log?.outOfRange ?? false;
    requiredItems += 1;
    if (poolLogged) completedItems += 1;
    else missingItemKeys.push('Piscina: medición del día');
  }

  const compliancePct = requiredItems === 0 ? 100 : Math.round((completedItems / requiredItems) * 10000) / 100;
  const dayStatus: DayStatus = completedItems === 0 && requiredItems > 0 ? 'missing' : compliancePct >= 100 ? 'complete' : 'partial';

  return { date, requiredItems, completedItems, compliancePct, dayStatus, poolLogged, poolOutOfRange, missingItemKeys };
}

function isPeriodClosingDay(freq: string, date: string): boolean {
  const d = new Date(`${date}T00:00:00Z`);
  switch (freq) {
    case 'weekly': return d.getUTCDay() === 0;                       // domingo cierra la semana
    case 'monthly': case 'seasonal': return isLastDayOfMonth(date);
    case 'quarterly': return isLastDayOfMonth(date) && [2, 5, 8, 11].includes(d.getUTCMonth());
    case 'biannual': return isLastDayOfMonth(date) && [5, 11].includes(d.getUTCMonth());
    case 'annual': return date.slice(5) === '12-31';
    default: return true;
  }
}

function isLastDayOfMonth(date: string): boolean {
  return diffDays(date, addDays(date, 1)) === 1 && addDays(date, 1).slice(8) === '01';
}

/** Persiste la instantánea del día. Idempotente por (building_id, snapshot_date). */
export async function upsertSnapshot(tx: Tx, ctx: AuthContext, day: DayCompliance): Promise<void> {
  const prevDate = addDays(day.date, -1);
  const [prev] = await tx
    .select({ streak: complianceSnapshots.missingStreakDays })
    .from(complianceSnapshots)
    .where(and(eq(complianceSnapshots.buildingId, ctx.buildingId), eq(complianceSnapshots.snapshotDate, prevDate)))
    .limit(1);

  const missingStreakDays = day.dayStatus === 'missing' ? (prev?.streak ?? 0) + 1 : 0;

  await tx
    .insert(complianceSnapshots)
    .values({
      buildingId: ctx.buildingId,
      snapshotDate: day.date,
      requiredItems: day.requiredItems,
      completedItems: day.completedItems,
      compliancePct: day.compliancePct.toFixed(2),
      dayStatus: day.dayStatus,
      poolLogged: day.poolLogged,
      poolOutOfRange: day.poolOutOfRange,
      missingStreakDays,
      missingItemKeys: day.missingItemKeys,
      computedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [complianceSnapshots.buildingId, complianceSnapshots.snapshotDate],
      set: {
        requiredItems: day.requiredItems,
        completedItems: day.completedItems,
        compliancePct: day.compliancePct.toFixed(2),
        dayStatus: day.dayStatus,
        poolLogged: day.poolLogged,
        poolOutOfRange: day.poolOutOfRange,
        missingStreakDays,
        missingItemKeys: day.missingItemKeys,
        computedAt: new Date(),
      },
    });
}

export type Period = 'day' | 'week' | 'month' | 'season';

export function periodRange(period: Period, today: string, settings: Parameters<typeof seasonFor>[1]): { from: string; to: string } {
  switch (period) {
    case 'day': return { from: today, to: today };
    case 'week': {
      const dow = new Date(`${today}T00:00:00Z`).getUTCDay() || 7;
      return { from: addDays(today, 1 - dow), to: today };
    }
    case 'month': return { from: startOfMonth(today), to: today };
    case 'season': {
      const from = settings?.season?.highFrom ?? '12-01';
      const year = today.slice(5) >= from ? today.slice(0, 4) : String(Number(today.slice(0, 4)) - 1);
      return { from: `${year}-${from}`, to: today };
    }
  }
}

/**
 * ESPEC §4.8 y §5.11 — misma consulta para el encargado y para la administración.
 * RN-49: el encargado ve exactamente el mismo detalle. No hay versión recortada.
 */
export async function complianceOverview(
  tx: Tx,
  ctx: AuthContext,
  opts: { period: Period; from?: string; to?: string; calendarDays?: number },
) {
  assertCan(ctx, 'read', 'compliance_building');

  const today = localDate(new Date(), ctx.buildingTimezone);
  const range = opts.from && opts.to ? { from: opts.from, to: opts.to } : periodRange(opts.period, today, ctx.buildingSettings);
  const calendarDays = opts.calendarDays ?? 30;
  const calendarFrom = addDays(today, -(calendarDays - 1));

  const snapshots = await tx
    .select()
    .from(complianceSnapshots)
    .where(
      and(
        eq(complianceSnapshots.buildingId, ctx.buildingId),
        gte(complianceSnapshots.snapshotDate, calendarFrom < range.from ? calendarFrom : range.from),
        lte(complianceSnapshots.snapshotDate, today),
      ),
    )
    .orderBy(asc(complianceSnapshots.snapshotDate));

  const inRange = snapshots.filter((s) => s.snapshotDate >= range.from && s.snapshotDate <= range.to);
  const totalRequired = inRange.reduce((a, s) => a + s.requiredItems, 0);
  const totalCompleted = inRange.reduce((a, s) => a + s.completedItems, 0);
  const compliancePct = totalRequired === 0 ? 100 : Math.round((totalCompleted / totalRequired) * 10000) / 100;

  // Racha: días consecutivos con el plan completo hacia atrás desde hoy;
  // si el último día está en `missing`, la racha es negativa (días sin registro).
  const byDateDesc = [...snapshots].reverse();
  let positiveStreak = 0;
  let negativeStreak = 0;
  for (const s of byDateDesc) {
    if (s.dayStatus === 'complete') { if (negativeStreak === 0) positiveStreak += 1; else break; }
    else if (s.dayStatus === 'missing') { if (positiveStreak === 0) negativeStreak += 1; else break; }
    else break;
  }

  const calendar = [];
  for (let d = calendarFrom; diffDays(d, today) >= 0; d = addDays(d, 1)) {
    const s = snapshots.find((x) => x.snapshotDate === d);
    calendar.push({
      date: d,
      // Un día sin snapshot es "sin computar", distinto de "faltante" (RN-43).
      status: s ? s.dayStatus : ('missing' as DayStatus),
      computed: Boolean(s),
      compliancePct: s ? Number(s.compliancePct) : 0,
      poolLogged: s?.poolLogged ?? null,
      poolOutOfRange: s?.poolOutOfRange ?? null,
    });
  }

  const incompleteDays = inRange
    .filter((s) => s.dayStatus !== 'complete')
    .map((s) => ({ date: s.snapshotDate, status: s.dayStatus, pct: Number(s.compliancePct), missing: s.missingItemKeys ?? [] }));

  return {
    framing: COMPLIANCE_FRAMING,
    period: opts.period,
    range,
    season: seasonFor(today, ctx.buildingSettings),
    compliancePct,
    requiredItems: totalRequired,
    completedItems: totalCompleted,
    streak: { complete: positiveStreak, missing: negativeStreak },
    calendar,
    incompleteDays,
  };
}

/** RN-46 — Ítems sistemáticamente omitidos (≥ 80 % de omisión en 30 días). */
export async function omittedItems(tx: Tx, ctx: AuthContext) {
  assertCan(ctx, 'read', 'compliance_building');
  const threshold = ctx.buildingSettings.omittedItemThresholdPct ?? 80;
  const { rows } = await tx.execute(sql`
    select template_id, item_key, label, occurrences, times_missed, miss_pct
      from v_omitted_items
     where building_id = ${ctx.buildingId} and miss_pct >= ${threshold}
     order by miss_pct desc, times_missed desc
  `);
  return { framing: COMPLIANCE_FRAMING, threshold, items: rows };
}

/** RN-47 — Avisos de tendencia. Los huecos rompen la secuencia: nunca se interpolan. */
export async function poolTrends(tx: Tx, ctx: AuthContext, days = 30) {
  assertCan(ctx, 'read', 'compliance_building');
  const today = localDate(new Date(), ctx.buildingTimezone);
  const from = addDays(today, -days);

  const rows = await tx
    .select()
    .from(poolLogs)
    .where(and(eq(poolLogs.buildingId, ctx.buildingId), gte(poolLogs.loggedOn, from)))
    .orderBy(asc(poolLogs.loggedOn), asc(poolLogs.loggedAt));

  const byDate = new Map(rows.map((r) => [r.loggedOn, r]));
  const alerts = [];
  const ranges = poolRanges(ctx.buildingSettings);

  for (const param of POOL_PARAMS) {
    // Serie día a día: la ausencia entra como null y corta la secuencia.
    const series: { value: number | null }[] = [];
    for (let d = from; diffDays(d, today) >= 0; d = addDays(d, 1)) {
      const row = byDate.get(d);
      const raw = row ? row[columnFor(param)] : null;
      series.push({ value: raw === null || raw === undefined ? null : Number(raw) });
    }
    const alert = detectTrend(param, series, ctx.buildingSettings);
    if (alert) alerts.push({ ...alert, label: ranges[param].label, unit: ranges[param].unit });
  }
  return { framing: COMPLIANCE_FRAMING, from, to: today, alerts };
}

function columnFor(p: PoolParam): 'freeChlorine' | 'ph' | 'alkalinity' | 'calciumHardness' {
  return p;
}

/** ESPEC §5.11 d — Tareas aprobadas: volumen, tiempo, costo y tasa de derivación. */
export async function approvedTaskStats(tx: Tx, ctx: AuthContext, from: string, to: string) {
  assertCan(ctx, 'read', 'compliance_building');
  const { rows } = await tx.execute(sql`
    select trade,
           count(*)::int                                       as total,
           coalesce(avg(time_spent_minutes), 0)::numeric(10,1) as avg_minutes,
           coalesce(sum(cost_amount), 0)::numeric(14,2)        as total_cost,
           round(100.0 * count(*) filter (where escalated) / nullif(count(*), 0), 2) as escalation_pct
      from approved_task_logs
     where building_id = ${ctx.buildingId} and performed_on between ${from}::date and ${to}::date
     group by trade order by total desc
  `);
  return { framing: COMPLIANCE_FRAMING, from, to, byTrade: rows };
}

/** ESPEC §4.8 — El indicador del encargado. Mismo cálculo, mismo detalle (RN-49). */
export async function myCompliance(tx: Tx, ctx: AuthContext) {
  assertCan(ctx, 'read', 'compliance_self');
  const today = localDate(new Date(), ctx.buildingTimezone);

  // Secuencial a propósito: `tx` es UN cliente del pool. Lanzar las consultas en
  // paralelo sobre el mismo cliente las encola de todos modos y rompe la
  // transacción; pg lo avisa como deprecación y en pg@9 será un error.
  const day = await complianceOverview(tx, ctx, { period: 'day' });
  const week = await complianceOverview(tx, ctx, { period: 'week' });
  const month = await complianceOverview(tx, ctx, { period: 'month', calendarDays: 30 });
  const trends = await poolTrends(tx, ctx, 30);

  const pending = await pendingToday(tx, ctx, today);

  return {
    framing: COMPLIANCE_FRAMING,
    today,
    season: seasonFor(today, ctx.buildingSettings),
    periods: { day: day.compliancePct, week: week.compliancePct, month: month.compliancePct },
    streak: month.streak,
    calendar: month.calendar,
    pending,
    trends: trends.alerts,
  };
}

/** Pendientes de hoy y de la semana, con acceso directo para completarlos. */
export async function pendingToday(tx: Tx, ctx: AuthContext, date: string) {
  const day = await computeDay(tx, ctx, date);
  return { date, missing: day.missingItemKeys, compliancePct: day.compliancePct, dayStatus: day.dayStatus };
}

export async function latestSnapshot(tx: Tx, ctx: AuthContext) {
  const [row] = await tx
    .select()
    .from(complianceSnapshots)
    .where(eq(complianceSnapshots.buildingId, ctx.buildingId))
    .orderBy(desc(complianceSnapshots.snapshotDate))
    .limit(1);
  return row ?? null;
}

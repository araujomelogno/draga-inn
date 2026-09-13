import { and, asc, desc, eq, gte, inArray, lte, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Tx } from '@/db/tx';
import type { AuthContext } from '@/auth/context';
import {
  approvedTaskLogs, checklistInstances, checklistItemResults, checklistTemplates,
  incidents, poolLogs, stockItems, stockMovements,
} from '@/db/schema';
import type { ChecklistItem } from '@/db/schema/logbook';
import { appendEvent, openCase } from '@/modules/cases/repo';
import { createTicket } from '@/modules/tickets/service';
import { assertCan } from '@/policy/can';
import { ValidationError } from '@/shared/errors';
import { addDays, diffDays, localDate } from '@/shared/dates';
import { evaluatePoolReading, poolRanges, POOL_PARAMS, type PoolParam } from '@/shared/pool';
import { seasonFor } from '@/shared/season';
import {
  approvedTaskSchema, checklistItemSchema, incidentSchema, poolLogSchema,
  stockMovementSchema, TRADE_LABELS, INCIDENT_LABELS,
} from '@/shared/schemas';
import { enqueue } from '@/modules/notifications/outbox';

// ═══════════════════════════════════════════════════════════════════════════
// Checklists (ESPEC §4.1, §3.5)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Materializa (si hace falta) las instancias de checklist que corresponden a
 * una fecha, y devuelve el plan del día con su progreso.
 * En temporada alta se incluyen también las plantillas estacionales (RN-40).
 */
export async function checklistsForDate(tx: Tx, ctx: AuthContext, date: string) {
  assertCan(ctx, 'read', 'logbook');
  const season = seasonFor(date, ctx.buildingSettings);

  const templates = await tx
    .select()
    .from(checklistTemplates)
    .where(and(eq(checklistTemplates.buildingId, ctx.buildingId), eq(checklistTemplates.active, true)));

  const applicable = templates.filter((t) => appliesOn(t.freq, t.seasonal, date, season.isHigh));

  for (const t of applicable) {
    await tx
      .insert(checklistInstances)
      .values({ buildingId: ctx.buildingId, templateId: t.id, periodDate: periodKey(t.freq, date), createdBy: ctx.user.id })
      .onConflictDoNothing({ target: [checklistInstances.templateId, checklistInstances.periodDate] });
  }

  // Cada plantilla se busca con SU período canónico: una semanal y una diaria
  // no comparten `period_date`, así que el par (plantilla, período) es lo que
  // identifica la instancia.
  const pares = applicable.map((t) =>
    and(eq(checklistInstances.templateId, t.id), eq(checklistInstances.periodDate, periodKey(t.freq, date))),
  );

  const instances = pares.length === 0 ? [] : await tx
    .select({
      id: checklistInstances.id,
      templateId: checklistInstances.templateId,
      templateName: checklistTemplates.name,
      freq: checklistTemplates.freq,
      periodDate: checklistInstances.periodDate,
      status: checklistInstances.status,
      items: checklistTemplates.items,
    })
    .from(checklistInstances)
    .innerJoin(checklistTemplates, eq(checklistTemplates.id, checklistInstances.templateId))
    .where(and(eq(checklistInstances.buildingId, ctx.buildingId), or(...pares)));

  const results = instances.length
    ? await tx
        .select()
        .from(checklistItemResults)
        .where(inArray(checklistItemResults.instanceId, instances.map((i) => i.id)))
    : [];

  const byInstance = new Map<string, typeof results>();
  for (const r of results) {
    const list = byInstance.get(r.instanceId) ?? [];
    list.push(r);
    byInstance.set(r.instanceId, list);
  }

  return {
    date,
    season,
    checklists: instances.map((inst) => {
      const done = new Map((byInstance.get(inst.id) ?? []).map((r) => [r.itemKey, r]));
      const items = (inst.items as ChecklistItem[]).map((item) => ({
        ...item,
        done: done.get(item.key)?.done ?? false,
        note: done.get(item.key)?.note ?? null,
      }));
      // RN-48: el progreso se mide solo sobre ítems requeridos.
      const required = items.filter((i) => i.required);
      return {
        instanceId: inst.id,
        templateId: inst.templateId,
        name: inst.templateName,
        freq: inst.freq,
        periodDate: inst.periodDate,
        status: inst.status,
        items,
        progress: { done: required.filter((i) => i.done).length, total: required.length },
      };
    }),
  };
}

/** Marcar un ítem. Idempotente por `client_uuid` para que el offline no duplique. */
export async function markChecklistItem(
  tx: Tx,
  ctx: AuthContext,
  instanceId: string,
  itemKey: string,
  input: z.infer<typeof checklistItemSchema>,
) {
  assertCan(ctx, 'update', 'logbook');

  const [instance] = await tx
    .select({ id: checklistInstances.id, templateId: checklistInstances.templateId, items: checklistTemplates.items })
    .from(checklistInstances)
    .innerJoin(checklistTemplates, eq(checklistTemplates.id, checklistInstances.templateId))
    .where(and(eq(checklistInstances.id, instanceId), eq(checklistInstances.buildingId, ctx.buildingId)))
    .limit(1);
  if (!instance) throw new ValidationError('No encontramos ese checklist.');

  const item = (instance.items as ChecklistItem[]).find((i) => i.key === itemKey);
  if (!item) throw new ValidationError('Ese ítem no pertenece a la plantilla.');

  await tx
    .insert(checklistItemResults)
    .values({
      buildingId: ctx.buildingId, instanceId, itemKey, label: item.label, required: item.required,
      done: input.done, note: input.note ?? null,
      completedAt: input.done ? new Date() : null,
      completedBy: input.done ? ctx.user.id : null,
      clientUuid: input.clientUuid ?? null,
    })
    .onConflictDoUpdate({
      target: [checklistItemResults.instanceId, checklistItemResults.itemKey],
      set: {
        done: input.done, note: input.note ?? null,
        completedAt: input.done ? new Date() : null,
        completedBy: input.done ? ctx.user.id : null,
      },
    });

  return recomputeChecklistStatus(tx, ctx, instanceId);
}

/** RN-31: no se completa con ítems requeridos sin marcar. */
export async function recomputeChecklistStatus(tx: Tx, ctx: AuthContext, instanceId: string) {
  const { rows } = await tx.execute(sql`
    select required_items, completed_items, pct
      from v_checklist_compliance where instance_id = ${instanceId}
  `);
  // `count(*)` vuelve de Postgres como bigint, y node-pg lo entrega como string.
  // Sin convertir, `'10' >= '9'` compara texto y da false: un checklist de diez
  // ítems nunca se marcaría completo.
  const raw = (rows[0] ?? {}) as { required_items?: string | number; completed_items?: string | number };
  const r = { required_items: Number(raw.required_items ?? 0), completed_items: Number(raw.completed_items ?? 0) };
  const status = r.completed_items === 0 ? 'pending' : r.completed_items >= r.required_items ? 'complete' : 'partial';

  await tx
    .update(checklistInstances)
    .set({ status, completedAt: status === 'complete' ? new Date() : null })
    .where(and(eq(checklistInstances.id, instanceId), eq(checklistInstances.buildingId, ctx.buildingId)));

  return { instanceId, status, progress: { done: r.completed_items, total: r.required_items } };
}

function appliesOn(freq: string, seasonal: boolean, date: string, isHighSeason: boolean): boolean {
  if (seasonal && !isHighSeason) return false;
  switch (freq) {
    case 'daily': return true;
    case 'weekly': return true;   // la instancia es semanal: periodKey la agrupa
    case 'monthly': return true;
    case 'quarterly': return true;
    case 'biannual': return true;
    case 'annual': return true;
    case 'seasonal': return isHighSeason;
    default: return false;
  }
}

/** Fecha canónica de la instancia según la frecuencia (lunes de la semana, día 1 del mes, …). */
export function periodKey(freq: string, date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  switch (freq) {
    case 'weekly': {
      const dow = d.getUTCDay() === 0 ? 7 : d.getUTCDay();
      return addDays(date, 1 - dow);
    }
    case 'monthly':
    case 'seasonal':
      return `${date.slice(0, 7)}-01`;
    case 'quarterly': {
      const q = Math.floor((d.getUTCMonth()) / 3) * 3 + 1;
      return `${date.slice(0, 4)}-${String(q).padStart(2, '0')}-01`;
    }
    case 'biannual': {
      const h = d.getUTCMonth() < 6 ? 1 : 7;
      return `${date.slice(0, 4)}-${String(h).padStart(2, '0')}-01`;
    }
    case 'annual':
      return `${date.slice(0, 4)}-01-01`;
    default:
      return date;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Piscina — Anexo A (ESPEC §4.3)
// ═══════════════════════════════════════════════════════════════════════════

export async function createPoolLog(tx: Tx, ctx: AuthContext, input: z.infer<typeof poolLogSchema>) {
  assertCan(ctx, 'create', 'logbook');

  if (input.clientUuid) {
    const [dup] = await tx.select().from(poolLogs).where(eq(poolLogs.clientUuid, input.clientUuid)).limit(1);
    if (dup) return { log: dup, duplicate: true as const, evaluation: null, ticketId: null };
  }

  const today = localDate(new Date(), ctx.buildingTimezone);
  // CB-02: hasta 7 días hacia atrás; más allá exige justificación.
  const graceDays = ctx.buildingSettings.backdateGraceDays ?? 7;
  const backDays = diffDays(input.loggedOn, today);
  if (backDays > graceDays && !input.backdateReason?.trim()) {
    throw new ValidationError(
      `Estás cargando un registro de hace ${backDays} días. Contá por qué se carga ahora.`,
      { fields: { backdateReason: 'Escribí el motivo de la carga tardía.' } },
    );
  }
  if (backDays < 0) throw new ValidationError('No se pueden cargar mediciones con fecha futura.');

  const reading = {
    freeChlorine: input.freeChlorine ?? null,
    ph: input.ph ?? null,
    alkalinity: input.alkalinity ?? null,
    calciumHardness: input.calciumHardness ?? null,
  };
  const evaluation = evaluatePoolReading(reading, ctx.buildingSettings);

  // RN-21: fuera de rango ⇒ observación obligatoria.
  if (evaluation.requiresObservation && !input.observations?.trim()) {
    const ranges = poolRanges(ctx.buildingSettings);
    const offenders = [...evaluation.outOfRange, ...evaluation.critical].map((p) => ranges[p].label);
    throw new ValidationError(
      `${offenders.join(' y ')} ${offenders.length === 1 ? 'está' : 'están'} fuera de rango. Escribí una observación explicando qué hiciste.`,
      { fields: { observations: 'La observación es obligatoria cuando un valor sale de rango.' } },
    );
  }

  const outOfRangeParams = [...evaluation.outOfRange, ...evaluation.critical];

  const [log] = await tx
    .insert(poolLogs)
    .values({
      buildingId: ctx.buildingId,
      loggedOn: input.loggedOn,
      ...(input.loggedAt ? { loggedAt: new Date(input.loggedAt) } : {}),
      freeChlorine: input.freeChlorine?.toString() ?? null,
      ph: input.ph?.toString() ?? null,
      alkalinity: input.alkalinity?.toString() ?? null,
      calciumHardness: input.calciumHardness?.toString() ?? null,
      skimmed: input.skimmed ?? null,
      basketsCleaned: input.basketsCleaned ?? null,
      productsApplied: input.productsApplied ?? null,
      observations: input.observations ?? null,
      backdateReason: input.backdateReason ?? null,
      outOfRange: outOfRangeParams.length > 0,
      outOfRangeParams: outOfRangeParams.length ? outOfRangeParams : null,
      loggedBy: ctx.user.id,
      clientUuid: input.clientUuid ?? null,
    })
    .onConflictDoNothing({ target: poolLogs.clientUuid })
    .returning();

  if (!log) {
    const [existing] = await tx.select().from(poolLogs).where(eq(poolLogs.clientUuid, input.clientUuid!)).limit(1);
    return { log: existing!, duplicate: true as const, evaluation, ticketId: null };
  }

  let ticketId: string | null = null;

  // RN-22: fuera de rango crítico ⇒ ticket `critical` vinculado al registro.
  if (evaluation.requiresCriticalTicket) {
    const ranges = poolRanges(ctx.buildingSettings);
    const detail = evaluation.critical
      .map((p) => `${ranges[p].label}: ${reading[p]} ${ranges[p].unit} (rango ${ranges[p].min}–${ranges[p].max})`)
      .join('; ');

    const kase = await openCase(tx, ctx, {
      title: 'Piscina fuera de rango crítico',
      category: 'piscina',
      summary: detail,
    });

    const { ticket } = await createTicket(tx, ctx, {
      caseId: kase.id,
      title: 'Piscina: valor fuera de rango crítico',
      description: `Medición del ${input.loggedOn}. ${detail}. Observación del encargado: ${input.observations ?? '—'}`,
      category: 'piscina',
      priority: 'critical',
      source: 'pwa',
      photoDocumentIds: [],
    });
    ticketId = ticket.id;

    // El ticket queda vinculado al registro que lo originó.
    await tx.update(poolLogs).set({ caseId: kase.id }).where(eq(poolLogs.id, log.id));
    await appendEvent(tx, ctx, {
      caseId: kase.id, eventType: 'pool_log_recorded', entityType: 'pool_log', entityId: log.id,
      note: detail, payload: { critical: evaluation.critical, ticketId },
    });
    await enqueue(tx, ctx.buildingId, 'ticket.critical', {
      ticketId, number: ticket.number, title: 'Piscina fuera de rango crítico',
    });
  }

  return { log, duplicate: false as const, evaluation, ticketId };
}

/** Últimas mediciones, para dar contexto en la pantalla de carga (ESPEC §4.3). */
export async function recentPoolLogs(tx: Tx, ctx: AuthContext, limit = 3) {
  return tx
    .select()
    .from(poolLogs)
    .where(eq(poolLogs.buildingId, ctx.buildingId))
    .orderBy(desc(poolLogs.loggedOn), desc(poolLogs.loggedAt))
    .limit(limit);
}

/**
 * Serie de piscina de un período. Los días sin registro quedan como HUECOS
 * explícitos: no se interpolan (RN-43, ESPEC §5.11 b).
 */
export async function poolSeries(tx: Tx, ctx: AuthContext, from: string, to: string) {
  const rows = await tx
    .select()
    .from(poolLogs)
    .where(and(eq(poolLogs.buildingId, ctx.buildingId), gte(poolLogs.loggedOn, from), lte(poolLogs.loggedOn, to)))
    .orderBy(asc(poolLogs.loggedOn), asc(poolLogs.loggedAt));

  const byDate = new Map<string, (typeof rows)[number]>();
  for (const r of rows) byDate.set(r.loggedOn, r);

  const points: { date: string; present: boolean; values: Partial<Record<PoolParam, number | null>>; outOfRange: boolean }[] = [];
  for (let d = from; diffDays(d, to) >= 0; d = addDays(d, 1)) {
    const row = byDate.get(d);
    points.push({
      date: d,
      present: Boolean(row),
      outOfRange: row?.outOfRange ?? false,
      values: row
        ? {
            freeChlorine: row.freeChlorine === null ? null : Number(row.freeChlorine),
            ph: row.ph === null ? null : Number(row.ph),
            alkalinity: row.alkalinity === null ? null : Number(row.alkalinity),
            calciumHardness: row.calciumHardness === null ? null : Number(row.calciumHardness),
          }
        : {},
    });
  }
  return { points, ranges: poolRanges(ctx.buildingSettings), params: POOL_PARAMS };
}

// ═══════════════════════════════════════════════════════════════════════════
// Tarea aprobada — Anexo B (ESPEC §4.4)
// ═══════════════════════════════════════════════════════════════════════════

export async function createApprovedTask(tx: Tx, ctx: AuthContext, input: z.infer<typeof approvedTaskSchema>) {
  assertCan(ctx, 'create', 'logbook');

  if (input.clientUuid) {
    const [dup] = await tx.select().from(approvedTaskLogs).where(eq(approvedTaskLogs.clientUuid, input.clientUuid)).limit(1);
    if (dup) return { log: dup, duplicate: true as const, ticketId: dup.escalatedTicketId };
  }

  const kase = await openCase(tx, ctx, {
    title: `${TRADE_LABELS[input.trade]} — ${input.description.slice(0, 60)}`,
    category: 'tarea_aprobada',
    summary: input.description,
  });

  const [log] = await tx
    .insert(approvedTaskLogs)
    .values({
      buildingId: ctx.buildingId,
      caseId: kase.id,
      performedOn: input.performedOn,
      trade: input.trade,
      description: input.description,
      materials: input.materials ?? null,
      timeSpentMinutes: input.timeSpentMinutes ?? null,
      escalated: input.escalated,
      escalationReason: input.escalationReason ?? null,
      // Regla 4: el hecho económico lleva monto, moneda y rubro aunque el v1 no calcule expensas.
      costAmount: input.costAmount ?? null,
      currency: input.currency ?? (input.costAmount ? ctx.buildingCurrency : null),
      budgetCategoryId: input.budgetCategoryId ?? null,
      loggedBy: ctx.user.id,
      clientUuid: input.clientUuid ?? null,
    })
    .onConflictDoNothing({ target: approvedTaskLogs.clientUuid })
    .returning();

  if (!log) {
    const [existing] = await tx.select().from(approvedTaskLogs).where(eq(approvedTaskLogs.clientUuid, input.clientUuid!)).limit(1);
    return { log: existing!, duplicate: true as const, ticketId: existing!.escalatedTicketId };
  }

  let ticketId: string | null = null;
  // RN-23: derivación a técnico ⇒ se ofrece crear ticket vinculado en el mismo paso.
  if (input.escalated && input.createEscalationTicket) {
    const { ticket } = await createTicket(tx, ctx, {
      caseId: kase.id,
      title: `Derivación a técnico — ${TRADE_LABELS[input.trade]}`,
      description: `${input.description}\n\nMotivo de la derivación: ${input.escalationReason}`,
      category: mapTradeToCategory(input.trade),
      priority: 'normal',
      source: 'pwa',
      photoDocumentIds: [],
    });
    ticketId = ticket.id;
    await tx.update(approvedTaskLogs).set({ escalatedTicketId: ticketId }).where(eq(approvedTaskLogs.id, log.id));
  }

  await appendEvent(tx, ctx, {
    caseId: kase.id, eventType: 'approved_task_logged', entityType: 'approved_task_log', entityId: log.id,
    note: input.description.slice(0, 140),
    payload: { trade: input.trade, escalated: input.escalated, costAmount: input.costAmount ?? null },
  });

  return { log, duplicate: false as const, ticketId };
}

function mapTradeToCategory(t: keyof typeof TRADE_LABELS): 'plomeria' | 'electricidad' | 'estructura' | 'otros' {
  if (t === 'plumbing') return 'plomeria';
  if (t === 'electrical') return 'electricidad';
  if (t === 'masonry') return 'estructura';
  return 'otros';
}

// ═══════════════════════════════════════════════════════════════════════════
// Incidente — Anexo F (ESPEC §4.5)
// ═══════════════════════════════════════════════════════════════════════════

const GRAVE: readonly string[] = ['accident', 'fire_start'];

export async function createIncident(tx: Tx, ctx: AuthContext, input: z.infer<typeof incidentSchema>) {
  assertCan(ctx, 'create', 'logbook');

  if (input.clientUuid) {
    const [dup] = await tx.select().from(incidents).where(eq(incidents.clientUuid, input.clientUuid)).limit(1);
    if (dup) return { incident: dup, duplicate: true as const };
  }

  const kase = await openCase(tx, ctx, {
    title: `${INCIDENT_LABELS[input.incidentType]} — ${input.description.slice(0, 60)}`,
    category: 'incidente',
    summary: input.description,
  });

  const [incident] = await tx
    .insert(incidents)
    .values({
      buildingId: ctx.buildingId, caseId: kase.id,
      occurredAt: new Date(input.occurredAt),
      incidentType: input.incidentType,
      description: input.description,
      actionTaken: input.actionTaken ?? null,
      notifiedTo: input.notifiedTo ?? null,
      status: input.status,
      loggedBy: ctx.user.id,
      clientUuid: input.clientUuid ?? null,
    })
    .onConflictDoNothing({ target: incidents.clientUuid })
    .returning();

  if (!incident) {
    const [existing] = await tx.select().from(incidents).where(eq(incidents.clientUuid, input.clientUuid!)).limit(1);
    return { incident: existing!, duplicate: true as const };
  }

  await appendEvent(tx, ctx, {
    caseId: kase.id, eventType: 'incident_logged', entityType: 'incident', entityId: incident.id,
    note: input.description.slice(0, 140), payload: { incidentType: input.incidentType },
  });

  // RN-25: accidente o principio de incendio notifica de inmediato por todos los canales.
  if (GRAVE.includes(input.incidentType)) {
    await enqueue(tx, ctx.buildingId, 'incident.grave', {
      incidentId: incident.id, type: input.incidentType,
      description: input.description, occurredAt: input.occurredAt,
    });
  }

  return { incident, duplicate: false as const };
}

// ═══════════════════════════════════════════════════════════════════════════
// Stock — Anexo E (ESPEC §4.6)
// ═══════════════════════════════════════════════════════════════════════════

/** Los que están por debajo del mínimo aparecen primero. */
export async function listStock(tx: Tx, ctx: AuthContext) {
  assertCan(ctx, 'read', 'logbook');
  return tx
    .select({
      id: stockItems.id, name: stockItems.name, unitOfMeasure: stockItems.unitOfMeasure,
      minQuantity: stockItems.minQuantity, currentQuantity: stockItems.currentQuantity,
      belowMinimum: sql<boolean>`${stockItems.currentQuantity} < ${stockItems.minQuantity}`,
    })
    .from(stockItems)
    .where(eq(stockItems.buildingId, ctx.buildingId))
    .orderBy(desc(sql`${stockItems.currentQuantity} < ${stockItems.minQuantity}`), asc(stockItems.name));
}

export async function createStockMovement(tx: Tx, ctx: AuthContext, input: z.infer<typeof stockMovementSchema>) {
  assertCan(ctx, 'create', 'logbook');

  if (input.clientUuid) {
    const [dup] = await tx.select().from(stockMovements).where(eq(stockMovements.clientUuid, input.clientUuid)).limit(1);
    if (dup) return { movement: dup, duplicate: true as const, item: null };
  }

  const [item] = await tx
    .select()
    .from(stockItems)
    .where(and(eq(stockItems.id, input.stockItemId), eq(stockItems.buildingId, ctx.buildingId)))
    .limit(1);
  if (!item) throw new ValidationError('No encontramos ese insumo.');

  const [movement] = await tx
    .insert(stockMovements)
    .values({
      buildingId: ctx.buildingId, stockItemId: input.stockItemId, kind: input.kind,
      quantity: input.quantity.toString(), reason: input.reason ?? null,
      loggedBy: ctx.user.id, clientUuid: input.clientUuid ?? null,
    })
    .onConflictDoNothing({ target: stockMovements.clientUuid })
    .returning();

  if (!movement) {
    const [existing] = await tx.select().from(stockMovements).where(eq(stockMovements.clientUuid, input.clientUuid!)).limit(1);
    return { movement: existing!, duplicate: true as const, item };
  }

  const before = Number(item.currentQuantity);
  const delta = input.kind === 'in' ? input.quantity : input.kind === 'out' ? -input.quantity : input.quantity - before;
  const after = before + delta;
  const min = Number(item.minQuantity);

  const patch: Partial<typeof stockItems.$inferInsert> = { currentQuantity: after.toFixed(2) };
  // RN-26: se notifica una sola vez por artículo hasta que se repone.
  const crossedDown = before >= min && after < min;
  const replenished = before < min && after >= min;
  if (crossedDown && !item.lowStockNotifiedAt) patch.lowStockNotifiedAt = new Date();
  if (replenished) patch.lowStockNotifiedAt = null;

  await tx.update(stockItems).set(patch).where(eq(stockItems.id, item.id));

  if (crossedDown && !item.lowStockNotifiedAt) {
    await enqueue(tx, ctx.buildingId, 'stock.low', {
      items: [{ name: item.name, current: after.toFixed(2), min: item.minQuantity }],
    });
  }

  return { movement, duplicate: false as const, item: { ...item, currentQuantity: after.toFixed(2) } };
}

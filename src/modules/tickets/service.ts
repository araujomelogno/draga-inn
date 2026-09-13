import { and, asc, desc, eq, inArray, isNull, or, sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import type { Tx } from '@/db/tx';
import { nextNumber } from '@/db/tx';
import type { AuthContext } from '@/auth/context';
import { documentLinks, ticketComments, tickets, units, users, syncReceipts } from '@/db/schema';
import { appendEvent, openCase } from '@/modules/cases/repo';
import { assertCan, can, canSeeInternalComments } from '@/policy/can';
import { assertTicketTransition, availableTicketTransitions, type TicketStatus } from '@/policy/transitions';
import { ConflictError, ForbiddenError, NotFoundError } from '@/shared/errors';
import { createTicketSchema, ticketCommentSchema, updateTicketSchema, TICKET_CATEGORY_LABELS } from '@/shared/schemas';
import { localDate } from '@/shared/dates';
import { enqueue } from '@/modules/notifications/outbox';

type CreateInput = z.infer<typeof createTicketSchema>;

/**
 * Alta de ticket. Si no viene `caseId`, abre un expediente (regla 1).
 * Idempotente por `client_uuid`: reintentar nunca duplica (HANDOFF §6.1).
 */
export async function createTicket(tx: Tx, ctx: AuthContext, input: CreateInput) {
  assertCan(ctx, 'create', 'ticket');

  if (input.clientUuid) {
    const [existing] = await tx.select().from(tickets).where(eq(tickets.clientUuid, input.clientUuid)).limit(1);
    if (existing) return { ticket: existing, duplicate: true as const };
  }

  // Un propietario solo puede reclamar sobre su unidad o sobre un área común.
  if (input.unitId && !can(ctx, 'read', 'unit_other') && !ctx.unitIds.includes(input.unitId)) {
    throw new ForbiddenError('Solo podés abrir reclamos sobre tu unidad o sobre las áreas comunes.');
  }

  // CB-14: la unidad puede haber desaparecido mientras el ticket estaba encolado.
  let unitId = input.unitId ?? null;
  let unitCode: string | null = null;
  let detachedUnitNote: string | null = null;
  if (unitId) {
    const [u] = await tx.select({ id: units.id, code: units.code }).from(units)
      .where(and(eq(units.id, unitId), eq(units.buildingId, ctx.buildingId))).limit(1);
    if (!u) {
      detachedUnitNote = `La unidad referida (${unitId}) ya no existe. Reasignar.`;
      unitId = null;
    } else {
      unitCode = u.code;
    }
  }

  const title = input.title ?? `${TICKET_CATEGORY_LABELS[input.category]} — ${input.description.slice(0, 60)}`;

  const caseId =
    input.caseId ??
    (await openCase(tx, ctx, { title, category: input.category, unitId, summary: input.description })).id;

  const number = await nextNumber(tx, ctx.buildingId, 'tickets');

  const [ticket] = await tx
    .insert(tickets)
    .values({
      buildingId: ctx.buildingId,
      caseId,
      number,
      unitId,
      commonAreaId: input.commonAreaId ?? null,
      assetId: input.assetId ?? null,
      title,
      description: input.description,
      category: input.category,
      priority: input.priority,
      status: 'new',
      reportedByUserId: ctx.user.id,
      source: input.source,
      detachedUnitNote,
      clientUuid: input.clientUuid ?? null,
      createdBy: ctx.user.id,
    })
    .onConflictDoNothing({ target: tickets.clientUuid })
    .returning();

  // ON CONFLICT DO NOTHING devuelve vacío si otro request ya lo insertó
  if (!ticket) {
    const [existing] = await tx.select().from(tickets).where(eq(tickets.clientUuid, input.clientUuid!)).limit(1);
    return { ticket: existing!, duplicate: true as const };
  }

  // RN-32: las fotos se vinculan aparte; el registro no espera a la foto.
  if (input.photoDocumentIds.length > 0) {
    await tx.insert(documentLinks)
      .values(input.photoDocumentIds.map((documentId) => ({ documentId, entityType: 'ticket', entityId: ticket.id })))
      .onConflictDoNothing();
  }

  await appendEvent(tx, ctx, {
    caseId,
    eventType: 'ticket_created',
    entityType: 'ticket',
    entityId: ticket.id,
    note: title,
    payload: { number, category: input.category, priority: input.priority, source: input.source },
  });

  await enqueue(tx, ctx.buildingId, 'ticket.created', {
    ticketId: ticket.id, number, title, priority: input.priority,
    unitId, unitLabel: unitCode ?? undefined, reportedBy: ctx.user.id,
  });

  if (detachedUnitNote) {
    await enqueue(tx, ctx.buildingId, 'ticket.unit_detached', { ticketId: ticket.id, number, title });
  }

  return { ticket, duplicate: false as const };
}

type UpdateInput = z.infer<typeof updateTicketSchema>;

export async function updateTicket(tx: Tx, ctx: AuthContext, ticketId: string, input: UpdateInput) {
  const ticket = await getTicketRow(tx, ctx, ticketId);

  const isReopenByOwner = input.status === 'in_progress' && ticket.status === 'resolved' && !can(ctx, 'update', 'ticket');
  if (!isReopenByOwner) assertCan(ctx, 'update', 'ticket', ticket);

  // CB-01: última escritura gana a nivel de campo, pero un cambio de estado avisa.
  if (input.expectedStatus && input.expectedStatus !== ticket.status) {
    throw new ConflictError(
      `Alguien cambió el estado del ticket a «${ticket.status}» mientras lo editabas. Recargá para ver lo último.`,
      { currentStatus: ticket.status },
    );
  }

  const patch: Partial<typeof tickets.$inferInsert> = {};
  const events: { type: 'ticket_status_changed' | 'ticket_assigned'; note: string; payload: Record<string, unknown> }[] = [];

  if (input.assignedToUserId !== undefined) {
    assertCan(ctx, 'assign', 'ticket');
    patch.assignedToUserId = input.assignedToUserId ?? null;
    events.push({ type: 'ticket_assigned', note: 'Responsable asignado', payload: { assignedToUserId: input.assignedToUserId } });
  }
  if (input.priority !== undefined) patch.priority = input.priority;
  if (input.unitId !== undefined) patch.unitId = input.unitId ?? null;
  if (input.assetId !== undefined) patch.assetId = input.assetId ?? null;
  if (input.dueDate !== undefined) patch.dueDate = input.dueDate ?? null;

  if (input.status && input.status !== ticket.status) {
    const reopenWindowDays = ctx.buildingSettings.ticketReopenDays ?? 7;
    assertTicketTransition(ctx, ticket.status as TicketStatus, input.status, {
      assignedToUserId: ticket.assignedToUserId,
      hasAssignee: Boolean(input.assignedToUserId ?? ticket.assignedToUserId),
      resolutionNote: input.resolutionNote,
      ownerVisibleComment: input.ownerVisibleComment,
      closeReason: input.closeReason,
      backwardReason: input.backwardReason,
      resolvedAt: ticket.resolvedAt?.toISOString() ?? null,
      reopenWindowDays,
      today: localDate(new Date(), ctx.buildingTimezone),
    });

    patch.status = input.status;
    if (input.status === 'resolved') {
      patch.resolvedAt = new Date();
      patch.resolutionNote = input.resolutionNote ?? null;
    }
    if (input.status === 'closed') {
      patch.closedAt = new Date();
      patch.closeReason = input.closeReason ?? null;
    }
    if (input.status === 'in_progress' && ticket.status === 'resolved') {
      patch.resolvedAt = null;
      patch.reopenedCount = ticket.reopenedCount + 1;
    }

    events.push({
      type: 'ticket_status_changed',
      note: input.resolutionNote ?? input.closeReason ?? input.backwardReason ?? null as unknown as string,
      payload: { from: ticket.status, to: input.status },
    });

    // El comentario visible que exige `* → waiting_owner`
    if (input.ownerVisibleComment) {
      await tx.insert(ticketComments).values({
        buildingId: ctx.buildingId, ticketId, authorUserId: ctx.user.id,
        body: input.ownerVisibleComment, isInternal: false,
      });
    }
  }

  if (Object.keys(patch).length > 0) {
    await tx.update(tickets).set(patch).where(and(eq(tickets.id, ticketId), eq(tickets.buildingId, ctx.buildingId)));
  }

  for (const ev of events) {
    await appendEvent(tx, ctx, {
      caseId: ticket.caseId, eventType: ev.type, entityType: 'ticket', entityId: ticketId,
      note: ev.note, payload: ev.payload,
    });
  }

  if (patch.status) {
    // RN-8: `waiting_owner` va al propietario de la unidad, no al reportante.
    const topic = patch.status === 'waiting_owner' ? 'ticket.waiting_owner' : 'ticket.status_changed';
    await enqueue(tx, ctx.buildingId, topic, {
      ticketId, number: ticket.number, title: ticket.title, from: ticket.status, to: patch.status,
      comment: input.ownerVisibleComment ?? '',
      reportedByUserId: ticket.reportedByUserId, unitId: ticket.unitId,
    });
  }

  return getTicketRow(tx, ctx, ticketId);
}

export async function addComment(tx: Tx, ctx: AuthContext, ticketId: string, input: z.infer<typeof ticketCommentSchema>) {
  const ticket = await getTicketRow(tx, ctx, ticketId);
  assertCan(ctx, 'read', 'ticket', ticket);

  // RN-14: solo staff puede marcar un comentario como interno.
  if (input.isInternal) assertCan(ctx, 'create', 'ticket_internal_comment');

  if (input.clientUuid) {
    const [dup] = await tx.select().from(ticketComments).where(eq(ticketComments.clientUuid, input.clientUuid)).limit(1);
    if (dup) return dup;
  }

  const [comment] = await tx
    .insert(ticketComments)
    .values({
      buildingId: ctx.buildingId, ticketId, authorUserId: ctx.user.id,
      body: input.body, isInternal: input.isInternal, clientUuid: input.clientUuid ?? null,
    })
    .onConflictDoNothing({ target: ticketComments.clientUuid })
    .returning();

  if (!comment) {
    const [existing] = await tx.select().from(ticketComments).where(eq(ticketComments.clientUuid, input.clientUuid!)).limit(1);
    return existing!;
  }

  await appendEvent(tx, ctx, {
    caseId: ticket.caseId, eventType: 'ticket_comment', entityType: 'ticket_comment', entityId: comment.id,
    note: input.isInternal ? '(comentario interno)' : input.body.slice(0, 140),
    payload: { isInternal: input.isInternal },
  });

  if (!input.isInternal) {
    await enqueue(tx, ctx.buildingId, 'ticket.comment', {
      ticketId, number: ticket.number, title: ticket.title, body: input.body,
      commentId: comment.id, reportedByUserId: ticket.reportedByUserId,
    });
  }
  return comment;
}

/**
 * RN-14 — filtro duro. Para un no-staff el comentario interno no sale por API:
 * no se devuelve enmascarado, directamente no se consulta.
 */
export async function listComments(tx: Tx, ctx: AuthContext, ticketId: string) {
  const where: SQL[] = [eq(ticketComments.ticketId, ticketId), eq(ticketComments.buildingId, ctx.buildingId)];
  if (!canSeeInternalComments(ctx)) where.push(eq(ticketComments.isInternal, false));

  return tx
    .select({
      id: ticketComments.id,
      body: ticketComments.body,
      isInternal: ticketComments.isInternal,
      createdAt: ticketComments.createdAt,
      authorUserId: ticketComments.authorUserId,
      authorName: users.displayName,
    })
    .from(ticketComments)
    .leftJoin(users, eq(users.id, ticketComments.authorUserId))
    .where(and(...where))
    .orderBy(asc(ticketComments.createdAt));
}

export type TicketFilters = {
  status?: TicketStatus[];
  priority?: string[];
  category?: string[];
  unitId?: string;
  assigneeId?: string;
  source?: string;
  from?: string;
  to?: string;
  onlyOverdue?: boolean;
  onlyUnassigned?: boolean;
  limit: number;
  offset: number;
};

/** ESPEC §5.2 — orden por defecto: vencidos primero, prioridad desc, antigüedad. */
export async function listTickets(tx: Tx, ctx: AuthContext, f: TicketFilters) {
  const where: SQL[] = [eq(tickets.buildingId, ctx.buildingId)];

  // Regla 3 + aislamiento: un propietario solo ve lo suyo y lo de áreas comunes.
  if (!can(ctx, 'read', 'unit_other')) {
    const propias = ctx.unitIds.length ? inArray(tickets.unitId, ctx.unitIds) : undefined;
    where.push(
      or(
        ...(propias ? [propias] : []),
        isNull(tickets.unitId),                       // áreas comunes
        eq(tickets.reportedByUserId, ctx.user.id),    // lo que él mismo reportó
      )!,
    );
  }

  if (f.status?.length) where.push(inArray(tickets.status, f.status));
  if (f.priority?.length) where.push(inArray(tickets.priority, f.priority as ('low'|'normal'|'high'|'critical')[]));
  if (f.category?.length) where.push(inArray(tickets.category, f.category));
  if (f.unitId) where.push(eq(tickets.unitId, f.unitId));
  if (f.assigneeId) where.push(eq(tickets.assignedToUserId, f.assigneeId));
  if (f.source) where.push(sql`${tickets.source}::text = ${f.source}`);
  if (f.from) where.push(sql`${tickets.createdAt} >= ${f.from}::date`);
  if (f.to) where.push(sql`${tickets.createdAt} < (${f.to}::date + 1)`);
  if (f.onlyUnassigned) where.push(isNull(tickets.assignedToUserId));
  if (f.onlyOverdue) where.push(sql`${tickets.dueDate} is not null and ${tickets.dueDate} < current_date and ${tickets.status} <> 'closed'`);

  const rows = await tx
    .select({
      id: tickets.id, number: tickets.number, title: tickets.title, category: tickets.category,
      priority: tickets.priority, status: tickets.status, unitId: tickets.unitId, unitCode: units.code,
      assignedToUserId: tickets.assignedToUserId, assigneeName: users.displayName,
      dueDate: tickets.dueDate, createdAt: tickets.createdAt, updatedAt: tickets.updatedAt,
      isOverdue: sql<boolean>`(${tickets.dueDate} is not null and ${tickets.dueDate} < current_date and ${tickets.status} <> 'closed')`,
    })
    .from(tickets)
    .leftJoin(units, eq(units.id, tickets.unitId))
    .leftJoin(users, eq(users.id, tickets.assignedToUserId))
    .where(and(...where))
    .orderBy(
      desc(sql`(${tickets.dueDate} is not null and ${tickets.dueDate} < current_date and ${tickets.status} <> 'closed')`),
      desc(sql`case ${tickets.priority} when 'critical' then 4 when 'high' then 3 when 'normal' then 2 else 1 end`),
      asc(tickets.createdAt),
    )
    .limit(f.limit)
    .offset(f.offset);

  const [{ total }] = (await tx.select({ total: sql<number>`count(*)::int` }).from(tickets).where(and(...where))) as [{ total: number }];
  return { rows, total };
}

export async function getTicketRow(tx: Tx, ctx: AuthContext, ticketId: string) {
  const [row] = await tx
    .select()
    .from(tickets)
    .where(and(eq(tickets.id, ticketId), eq(tickets.buildingId, ctx.buildingId)))
    .limit(1);
  if (!row) throw new NotFoundError('No encontramos el ticket.');
  return row;
}

export async function getTicketDetail(tx: Tx, ctx: AuthContext, ticketId: string) {
  const ticket = await getTicketRow(tx, ctx, ticketId);
  assertCan(ctx, 'read', 'ticket', ticket);
  const comments = await listComments(tx, ctx, ticketId);
  const reopenWindowDays = ctx.buildingSettings.ticketReopenDays ?? 7;

  return {
    ticket,
    comments,
    // P3: la UI solo muestra lo que este usuario puede hacer.
    availableTransitions: availableTicketTransitions(ctx, ticket.status as TicketStatus, {
      assignedToUserId: ticket.assignedToUserId,
      hasAssignee: Boolean(ticket.assignedToUserId),
      resolvedAt: ticket.resolvedAt?.toISOString() ?? null,
      reopenWindowDays,
      today: localDate(new Date(), ctx.buildingTimezone),
    }),
  };
}

/** RN-13: acciones masivas SIN cambio de estado. Solo asignar y priorizar. */
export async function bulkUpdate(
  tx: Tx,
  ctx: AuthContext,
  ticketIds: string[],
  patch: { assignedToUserId?: string | null; priority?: 'low' | 'normal' | 'high' | 'critical' },
) {
  if (patch.assignedToUserId !== undefined) assertCan(ctx, 'assign', 'ticket');
  else assertCan(ctx, 'update', 'ticket');

  const rows = await tx.select().from(tickets)
    .where(and(inArray(tickets.id, ticketIds), eq(tickets.buildingId, ctx.buildingId)));

  await tx.update(tickets).set(patch)
    .where(and(inArray(tickets.id, ticketIds), eq(tickets.buildingId, ctx.buildingId)));

  for (const t of rows) {
    await appendEvent(tx, ctx, {
      caseId: t.caseId,
      eventType: patch.assignedToUserId !== undefined ? 'ticket_assigned' : 'ticket_status_changed',
      entityType: 'ticket', entityId: t.id, note: 'Cambio masivo', payload: patch as Record<string, unknown>,
    });
  }
  return rows.length;
}

/** Registra el resultado de una mutación offline para poder responder idempotente. */
export async function recordReceipt(
  tx: Tx, buildingId: string, clientUuid: string, endpoint: string,
  entityType: string, entityId: string, result: 'applied' | 'duplicate',
) {
  await tx.insert(syncReceipts)
    .values({ clientUuid, buildingId, endpoint, entityType, entityId, result })
    .onConflictDoNothing();
}

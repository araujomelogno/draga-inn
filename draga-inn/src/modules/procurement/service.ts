import { and, asc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Tx } from '@/db/tx';
import { nextNumber } from '@/db/tx';
import type { AuthContext } from '@/auth/context';
import { approvals, governanceRules, invoices, quotes, vendors, workOrders } from '@/db/schema';
import { appendEvent } from '@/modules/cases/repo';
import { assertCan, can } from '@/policy/can';
import { approverFor, assertGovernance, canApproveAmount, checkGovernance, invoiceNeedsReapproval, ruleFor, type GovernanceRule } from '@/policy/governance';
import { ConflictError, ForbiddenError, GovernanceError, NotFoundError, ValidationError } from '@/shared/errors';
import { ROLE_LABELS } from '@/auth/context';
import { formatMoney } from '@/shared/format';
import { localDate } from '@/shared/dates';
import { approvalSchema, invoiceSchema, quoteSchema, workOrderSchema, acceptanceSchema } from '@/shared/schemas';
import { enqueue } from '@/modules/notifications/outbox';

async function rulesFor(tx: Tx, ctx: AuthContext): Promise<GovernanceRule[]> {
  const rows = await tx
    .select()
    .from(governanceRules)
    .where(and(eq(governanceRules.buildingId, ctx.buildingId), eq(governanceRules.active, true)))
    .orderBy(asc(governanceRules.thresholdAmount));
  return rows as unknown as GovernanceRule[];
}

export async function createQuote(tx: Tx, ctx: AuthContext, input: z.infer<typeof quoteSchema>) {
  assertCan(ctx, 'create', 'quote');

  const [vendor] = await tx.select().from(vendors)
    .where(and(eq(vendors.id, input.vendorId), eq(vendors.buildingId, ctx.buildingId))).limit(1);
  if (!vendor) throw new NotFoundError('No encontramos ese proveedor.');
  if (vendor.status !== 'active') {
    throw new ValidationError(`«${vendor.legalName}» está desactivado. Reactivalo antes de cargarle un presupuesto.`);
  }

  const [quote] = await tx.insert(quotes).values({
    buildingId: ctx.buildingId,
    caseId: input.caseId,
    vendorId: input.vendorId,
    description: input.description,
    amount: input.amount,
    currency: input.currency,
    budgetCategoryId: input.budgetCategoryId ?? null,
    leadTimeDays: input.leadTimeDays ?? null,
    validUntil: input.validUntil ?? null,
    documentId: input.documentId ?? null,
    createdBy: ctx.user.id,
  }).returning();

  await appendEvent(tx, ctx, {
    caseId: input.caseId, eventType: 'quote_submitted', entityType: 'quote', entityId: quote!.id,
    note: `${vendor.legalName} — ${formatMoney(input.amount, input.currency)}`,
    payload: { vendorId: input.vendorId, amount: input.amount, currency: input.currency },
  });

  const rules = await rulesFor(tx, ctx);
  const regla = ruleFor(Number(input.amount), rules);
  await enqueue(tx, ctx.buildingId, 'approval.pending', {
    caseId: input.caseId, caseNumber: await caseNumberOf(tx, input.caseId),
    quoteId: quote!.id, amount: input.amount, currency: input.currency,
    ruleName: regla?.name ?? 'Sin regla aplicable',
    requiredRole: approverFor(Number(input.amount), rules),
  });

  return quote!;
}

/**
 * ESPEC §5.7 — Comparador. Marca el más bajo pero NO recomienda:
 * la decisión es humana y se fundamenta (RN-29).
 */
export async function compareQuotes(tx: Tx, ctx: AuthContext, caseId: string) {
  assertCan(ctx, 'read', 'quote');
  const today = localDate(new Date(), ctx.buildingTimezone);

  const rows = await tx
    .select({
      id: quotes.id, vendorId: quotes.vendorId, vendorName: vendors.legalName,
      description: quotes.description, amount: quotes.amount, currency: quotes.currency,
      leadTimeDays: quotes.leadTimeDays, validUntil: quotes.validUntil, status: quotes.status,
      documentId: quotes.documentId, submittedAt: quotes.submittedAt,
    })
    .from(quotes)
    .innerJoin(vendors, eq(vendors.id, quotes.vendorId))
    .where(and(eq(quotes.caseId, caseId), eq(quotes.buildingId, ctx.buildingId)))
    .orderBy(asc(quotes.amount));

  const valid = rows.filter((q) => q.status !== 'rejected' && (!q.validUntil || q.validUntil >= today));
  const lowestId = valid[0]?.id ?? null;
  const rules = await rulesFor(tx, ctx);

  return {
    quotes: rows.map((q) => ({
      ...q,
      // CB-07: un presupuesto vencido no se puede aprobar.
      expired: Boolean(q.validUntil && q.validUntil < today),
      isLowest: q.id === lowestId,
    })),
    // Se marca el más bajo; el sistema no elige por nadie.
    lowestQuoteId: lowestId,
    rules,
    note: 'El sistema marca el presupuesto más bajo, pero no recomienda: la decisión se fundamenta.',
  };
}

/** ESPEC §5.7 — Aprobación. Append-only: una corrección crea una fila con supersedesId. */
export async function recordApproval(tx: Tx, ctx: AuthContext, input: z.infer<typeof approvalSchema>) {
  const rules = await rulesFor(tx, ctx);
  const today = localDate(new Date(), ctx.buildingTimezone);

  let amount = input.approvedAmount ? Number(input.approvedAmount) : 0;
  let currency = input.currency ?? ctx.buildingCurrency;

  if (input.subjectType === 'quote') {
    const [quote] = await tx.select().from(quotes)
      .where(and(eq(quotes.id, input.subjectId), eq(quotes.buildingId, ctx.buildingId))).limit(1);
    if (!quote) throw new NotFoundError('No encontramos el presupuesto.');

    // CB-07: presupuesto vencido ⇒ bloqueado, se exige revalidación del proveedor.
    if (quote.validUntil && quote.validUntil < today) {
      throw new ConflictError(
        `Ese presupuesto venció el ${quote.validUntil}. Pedile al proveedor que lo revalide antes de aprobarlo.`,
        { quoteId: quote.id, validUntil: quote.validUntil },
      );
    }
    // CB-08: dos aprobaciones simultáneas — la segunda falla y muestra la existente.
    const [existing] = await tx.select().from(approvals)
      .where(and(eq(approvals.subjectType, 'quote'), eq(approvals.subjectId, quote.id), sql`${approvals.supersedesId} is null`))
      .limit(1);
    if (existing && !input.supersedesId) {
      throw new ConflictError('Ese presupuesto ya fue resuelto por otra persona. Recargá para ver la decisión vigente.', {
        approvalId: existing.id, decidedAt: existing.decidedAt, decision: existing.decision,
      });
    }
    amount = Number(quote.amount);
    currency = quote.currency;
  }

  // La matriz decide según el umbral: bajo umbral admin o comisión, sobre umbral solo comisión.
  const requiredRole = approverFor(amount, rules);
  const subject = requiredRole === 'comision' ? 'approval_above' : 'approval_below';
  if (!can(ctx, 'approve', subject)) {
    throw new ForbiddenError(
      `Por ${formatMoney(amount, currency)} la aprobación corresponde a ${ROLE_LABELS[requiredRole]}. Pedísela a quien tenga ese rol.`,
      { requiredRole },
    );
  }
  if (!canApproveAmount(ctx, amount, rules)) {
    throw new ForbiddenError(
      `Tu rol no alcanza para aprobar ${formatMoney(amount, currency)}. Corresponde a ${ROLE_LABELS[requiredRole]}.`,
      { requiredRole },
    );
  }
  if (input.isException) assertCan(ctx, 'create', 'governance_exception');

  const approverRole = ctx.roles.includes('comision') ? 'comision' : 'administrador';
  const rule = rules.find((r) => r.requiredApproverRole === requiredRole && Number(r.thresholdAmount) <= amount);

  const [approval] = await tx.insert(approvals).values({
    buildingId: ctx.buildingId,
    caseId: input.caseId,
    subjectType: input.subjectType,
    subjectId: input.subjectId,
    decision: input.decision,
    approvedAmount: amount ? amount.toFixed(2) : null,
    currency,
    approverUserId: ctx.user.id,
    approverRole,
    rationale: input.rationale,
    supersedesId: input.supersedesId ?? null,
    isException: input.isException,
    exceptionReason: input.exceptionReason ?? null,
    ruleId: rule?.id ?? null,
  }).returning();

  if (input.subjectType === 'quote') {
    await tx.update(quotes)
      .set({ status: input.decision === 'approved' ? 'approved' : 'rejected' })
      .where(eq(quotes.id, input.subjectId));
  }

  await appendEvent(tx, ctx, {
    caseId: input.caseId,
    eventType: input.isException ? 'governance_exception' : 'approval_recorded',
    entityType: 'approval', entityId: approval!.id,
    note: input.isException ? input.exceptionReason! : input.rationale,
    payload: { decision: input.decision, amount, currency, isException: input.isException, approverRole },
  });

  // RN-02: la excepción se avisa a la comisión y queda destacada.
  if (input.isException) {
    await enqueue(tx, ctx.buildingId, 'governance.exception', {
      caseId: input.caseId, caseNumber: await caseNumberOf(tx, input.caseId),
      approvalId: approval!.id, reason: input.exceptionReason,
      actor: ctx.user.displayName ?? ctx.user.email,
    });
  }
  return approval!;
}

/** RN-20 — Se valida acá. Si no se cumple, se bloquea con el detalle de lo que falta. */
export async function issueWorkOrder(tx: Tx, ctx: AuthContext, input: z.infer<typeof workOrderSchema>) {
  assertCan(ctx, 'create', 'work_order');

  const rules = await rulesFor(tx, ctx);
  const today = localDate(new Date(), ctx.buildingTimezone);

  const caseQuotes = await tx.select().from(quotes)
    .where(and(eq(quotes.caseId, input.caseId), eq(quotes.buildingId, ctx.buildingId)));
  const caseApprovals = await tx.select().from(approvals)
    .where(and(eq(approvals.caseId, input.caseId), eq(approvals.buildingId, ctx.buildingId)));

  const selected = input.quoteId ? caseQuotes.find((q) => q.id === input.quoteId) : undefined;
  const amount = Number(input.amount ?? selected?.amount ?? 0);
  const currency = input.currency ?? selected?.currency ?? ctx.buildingCurrency;

  const govInput = {
    amount, currency,
    quotes: caseQuotes as never,
    approvals: caseApprovals as never,
    rules,
    quoteId: input.quoteId ?? undefined,
    today,
  };

  let usedException = false;
  const check = checkGovernance(govInput);

  if (!check.ok) {
    if (!input.governanceException) {
      // Bloqueo con el detalle: qué falta, quién lo resuelve.
      assertGovernance(govInput);
    }
    // La vía de excepción está reservada a administrador y comisión, y queda auditada.
    assertCan(ctx, 'create', 'governance_exception');
    usedException = true;
  }

  const number = await nextNumber(tx, ctx.buildingId, 'work_orders');

  const [wo] = await tx.insert(workOrders).values({
    buildingId: ctx.buildingId,
    caseId: input.caseId,
    vendorId: input.vendorId,
    quoteId: input.quoteId ?? null,
    number,
    scope: input.scope,
    amount: amount ? amount.toFixed(2) : null,
    currency,
    budgetCategoryId: input.budgetCategoryId ?? selected?.budgetCategoryId ?? null,
    scheduledFor: input.scheduledFor ?? null,
    status: 'issued',
    createdBy: ctx.user.id,
  }).returning();

  if (usedException) {
    const [exception] = await tx.insert(approvals).values({
      buildingId: ctx.buildingId,
      caseId: input.caseId,
      subjectType: 'work_order',
      subjectId: wo!.id,
      decision: 'approved',
      approvedAmount: amount ? amount.toFixed(2) : null,
      currency,
      approverUserId: ctx.user.id,
      approverRole: ctx.roles.includes('comision') ? 'comision' : 'administrador',
      rationale: 'Emisión de orden de trabajo con excepción de gobernanza.',
      isException: true,
      exceptionReason: input.governanceException!.reason,
      ruleId: check.ok ? null : check.rule.id,
    }).returning();

    await appendEvent(tx, ctx, {
      caseId: input.caseId, eventType: 'governance_exception', entityType: 'approval', entityId: exception!.id,
      note: input.governanceException!.reason,
      payload: { workOrderId: wo!.id, missing: check.ok ? null : check.missing },
    });
    await enqueue(tx, ctx.buildingId, 'governance.exception', {
      caseId: input.caseId, caseNumber: await caseNumberOf(tx, input.caseId),
      approvalId: exception!.id, reason: input.governanceException!.reason,
      actor: ctx.user.displayName ?? ctx.user.email,
    });
  }

  await appendEvent(tx, ctx, {
    caseId: input.caseId, eventType: 'work_order_issued', entityType: 'work_order', entityId: wo!.id,
    note: `OT #${number} — ${formatMoney(amount, currency)}`,
    payload: { number, vendorId: input.vendorId, amount, currency, withException: usedException },
  });

  return { workOrder: wo!, withException: usedException };
}

/** Conformidad: quién la dio, cuándo, con qué observaciones y fotos. */
export async function acceptWorkOrder(tx: Tx, ctx: AuthContext, workOrderId: string, input: z.infer<typeof acceptanceSchema>) {
  assertCan(ctx, 'update', 'work_order');

  const [wo] = await tx.select().from(workOrders)
    .where(and(eq(workOrders.id, workOrderId), eq(workOrders.buildingId, ctx.buildingId))).limit(1);
  if (!wo) throw new NotFoundError('No encontramos la orden de trabajo.');
  if (wo.status === 'accepted') throw new ConflictError('Esa orden ya tiene conformidad registrada.');
  if (wo.status === 'cancelled') throw new ConflictError('Esa orden está cancelada.');

  await tx.update(workOrders).set({
    status: 'accepted',
    completedAt: wo.completedAt ?? new Date(),
    acceptanceByUserId: ctx.user.id,
    acceptanceAt: new Date(),
    acceptanceNotes: input.acceptanceNotes,
  }).where(eq(workOrders.id, workOrderId));

  await appendEvent(tx, ctx, {
    caseId: wo.caseId, eventType: 'work_order_accepted', entityType: 'work_order', entityId: workOrderId,
    note: input.acceptanceNotes, payload: { number: wo.number, photos: input.photoDocumentIds.length },
  });

  return { ...wo, status: 'accepted' as const };
}

/** RN-15 y RN-16. */
export async function createInvoice(tx: Tx, ctx: AuthContext, input: z.infer<typeof invoiceSchema>) {
  assertCan(ctx, 'create', 'invoice');

  let caseId = input.caseId ?? null;

  if (input.workOrderId) {
    const [wo] = await tx.select().from(workOrders)
      .where(and(eq(workOrders.id, input.workOrderId), eq(workOrders.buildingId, ctx.buildingId))).limit(1);
    if (!wo) throw new NotFoundError('No encontramos la orden de trabajo.');
    caseId = wo.caseId;

    // RN-15: no se carga factura sin conformidad previa, salvo excepción auditada.
    if (wo.status !== 'accepted') {
      if (!input.acceptanceException) {
        throw new GovernanceError(
          `La orden #${wo.number} todavía no tiene conformidad. Registrá la conformidad antes de cargar la factura.`,
          { workOrderId: wo.id, workOrderStatus: wo.status, canResolve: ['administrador'] },
        );
      }
      assertCan(ctx, 'create', 'governance_exception');
    }
  }

  const [invoice] = await tx.insert(invoices).values({
    buildingId: ctx.buildingId,
    caseId,
    vendorId: input.vendorId,
    workOrderId: input.workOrderId ?? null,
    number: input.number,
    issueDate: input.issueDate,
    amount: input.amount,
    currency: input.currency,
    budgetCategoryId: input.budgetCategoryId ?? null,
    documentId: input.documentId ?? null,
    createdBy: ctx.user.id,
  }).returning();

  if (caseId) {
    if (input.acceptanceException) {
      const [exception] = await tx.insert(approvals).values({
        buildingId: ctx.buildingId, caseId, subjectType: 'invoice', subjectId: invoice!.id,
        decision: 'approved', approvedAmount: input.amount, currency: input.currency,
        approverUserId: ctx.user.id, approverRole: ctx.roles.includes('comision') ? 'comision' : 'administrador',
        rationale: 'Carga de factura sin conformidad previa.',
        isException: true, exceptionReason: input.acceptanceException.reason,
      }).returning();
      await appendEvent(tx, ctx, {
        caseId, eventType: 'governance_exception', entityType: 'approval', entityId: exception!.id,
        note: input.acceptanceException.reason, payload: { invoiceId: invoice!.id, rule: 'RN-15' },
      });
      await enqueue(tx, ctx.buildingId, 'governance.exception', {
        caseId, caseNumber: await caseNumberOf(tx, caseId),
        approvalId: exception!.id, reason: input.acceptanceException.reason,
        actor: ctx.user.displayName ?? ctx.user.email,
      });
    }
    await appendEvent(tx, ctx, {
      caseId, eventType: 'invoice_received', entityType: 'invoice', entityId: invoice!.id,
      note: `Factura ${input.number} — ${formatMoney(input.amount, input.currency)}`,
      payload: { amount: input.amount, currency: input.currency },
    });
  }

  return invoice!;
}

/** RN-16: por encima del aprobado + tolerancia, exige nueva aprobación antes de validar. */
export async function validateInvoice(tx: Tx, ctx: AuthContext, invoiceId: string) {
  assertCan(ctx, 'update', 'invoice');

  const [invoice] = await tx.select().from(invoices)
    .where(and(eq(invoices.id, invoiceId), eq(invoices.buildingId, ctx.buildingId))).limit(1);
  if (!invoice) throw new NotFoundError('No encontramos la factura.');
  if (invoice.status === 'validated') return invoice;

  const tolerancePct = ctx.buildingSettings.invoiceTolerancePct ?? 10;
  let approvedAmount: number | null = null;

  if (invoice.workOrderId) {
    const [wo] = await tx.select().from(workOrders).where(eq(workOrders.id, invoice.workOrderId)).limit(1);
    approvedAmount = wo?.amount ? Number(wo.amount) : null;
  }

  const check = invoiceNeedsReapproval(Number(invoice.amount), approvedAmount, tolerancePct);
  if (check.needs) {
    const [reapproval] = await tx.select().from(approvals)
      .where(and(eq(approvals.subjectType, 'invoice'), eq(approvals.subjectId, invoiceId), eq(approvals.decision, 'approved')))
      .limit(1);
    if (!reapproval) {
      throw new GovernanceError(
        `La factura supera en ${formatMoney(check.excess, invoice.currency)} el monto aprobado más la tolerancia del ${tolerancePct} %. ` +
          `Registrá una nueva aprobación por ${formatMoney(invoice.amount, invoice.currency)} antes de validarla.`,
        { approvedAmount, ceiling: check.ceiling, excess: check.excess, tolerancePct },
      );
    }
  }

  await tx.update(invoices)
    .set({ status: 'validated', validatedBy: ctx.user.id, validatedAt: new Date() })
    .where(eq(invoices.id, invoiceId));

  if (invoice.caseId) {
    await appendEvent(tx, ctx, {
      caseId: invoice.caseId, eventType: 'invoice_validated', entityType: 'invoice', entityId: invoiceId,
      note: `Factura ${invoice.number} validada`, payload: { amount: invoice.amount },
    });
  }
  return { ...invoice, status: 'validated' as const };
}

/** CB-06: un proveedor con trabajos no se elimina; se desactiva y el histórico queda. */
export async function deactivateVendor(tx: Tx, ctx: AuthContext, vendorId: string) {
  assertCan(ctx, 'update', 'vendor');
  const { rows } = await tx.execute(sql`
    select (select count(*) from work_orders where vendor_id = ${vendorId} and status not in ('cancelled'))::int as wos,
           (select count(*) from invoices    where vendor_id = ${vendorId})::int as invs
  `);
  const counts = rows[0] as { wos: number; invs: number };
  await tx.update(vendors).set({ status: 'inactive' })
    .where(and(eq(vendors.id, vendorId), eq(vendors.buildingId, ctx.buildingId)));
  return { deactivated: true, keptHistory: counts };
}

/** El correo y la línea de tiempo hablan de «Expediente #12», no de un uuid. */
async function caseNumberOf(tx: Tx, caseId: string): Promise<number | null> {
  const { rows } = await tx.execute(sql`select number from cases where id = ${caseId}::uuid`);
  const row = rows[0] as { number: string | number } | undefined;
  return row ? Number(row.number) : null;
}

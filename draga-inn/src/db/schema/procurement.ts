import { pgTable, uuid, text, date, timestamp, boolean, integer, bigint, numeric, pgEnum, unique, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { createdAt, updatedAt, money, currencyCol, appRole } from './_shared';
import { buildings } from './buildings';
import { users } from './people';
import { cases } from './cases';

export const vendorStatus = pgEnum('vendor_status', ['active', 'inactive']);

export const vendors = pgTable(
  'vendors',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    buildingId: uuid('building_id')
      .notNull()
      .references(() => buildings.id, { onDelete: 'cascade' }),
    legalName: text('legal_name').notNull(),
    tradeName: text('trade_name'),
    taxId: text('tax_id'),
    contactName: text('contact_name'),
    email: text('email'),
    phone: text('phone'),
    services: text('services').array().notNull().default(sql`'{}'::text[]`),
    rating: numeric('rating', { precision: 3, scale: 2 }),
    /** CB-06: un proveedor con trabajos no se elimina, se desactiva. */
    status: vendorStatus('status').notNull().default('active'),
    contractUntil: date('contract_until'),
    notes: text('notes'),
    createdAt,
    updatedAt,
    createdBy: uuid('created_by'),
  },
  (t) => [index('vendors_building_idx').on(t.buildingId, t.status)],
);

/** Regla 4: los rubros existen ya en v1, aunque el v1 no calcule expensas. */
export const budgetCategories = pgTable(
  'budget_categories',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    buildingId: uuid('building_id')
      .notNull()
      .references(() => buildings.id, { onDelete: 'cascade' }),
    code: text('code').notNull(),
    name: text('name').notNull(),
    parentId: uuid('parent_id'),
    createdAt,
    updatedAt,
    createdBy: uuid('created_by'),
  },
  (t) => [unique('budget_categories_uq').on(t.buildingId, t.code)],
);

export const quoteStatus = pgEnum('quote_status', ['submitted', 'approved', 'rejected', 'expired', 'superseded']);

export const quotes = pgTable(
  'quotes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    buildingId: uuid('building_id')
      .notNull()
      .references(() => buildings.id, { onDelete: 'cascade' }),
    caseId: uuid('case_id')
      .notNull()
      .references(() => cases.id),
    vendorId: uuid('vendor_id')
      .notNull()
      .references(() => vendors.id),
    description: text('description').notNull(),
    amount: money('amount').notNull(),
    currency: currencyCol().notNull().default('UYU'),
    budgetCategoryId: uuid('budget_category_id').references(() => budgetCategories.id),
    leadTimeDays: integer('lead_time_days'),
    validUntil: date('valid_until'),
    status: quoteStatus('status').notNull().default('submitted'),
    documentId: uuid('document_id'),
    submittedAt: timestamp('submitted_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt,
    updatedAt,
    createdBy: uuid('created_by').references(() => users.id),
  },
  (t) => [index('quotes_case_idx').on(t.caseId)],
);

/** RN-20: umbral, mínimo de presupuestos y rol aprobador. Configurable, nunca hardcodeado. */
export const governanceRules = pgTable(
  'governance_rules',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    buildingId: uuid('building_id')
      .notNull()
      .references(() => buildings.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    thresholdAmount: money('threshold_amount').notNull(),
    currency: currencyCol().notNull().default('UYU'),
    minQuotes: integer('min_quotes').notNull().default(1),
    requiredApproverRole: appRole('required_approver_role').notNull(),
    active: boolean('active').notNull().default(true),
    createdAt,
    updatedAt,
    createdBy: uuid('created_by'),
  },
  (t) => [index('governance_rules_building_idx').on(t.buildingId, t.active)],
);

export const approvalDecision = pgEnum('approval_decision', ['approved', 'rejected']);
export const approvalSubject = pgEnum('approval_subject', ['quote', 'work_order', 'invoice', 'decision']);

/** Append-only: una corrección crea una fila nueva con `supersedesId`. Trigger lo enforza. */
export const approvals = pgTable(
  'approvals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    buildingId: uuid('building_id')
      .notNull()
      .references(() => buildings.id, { onDelete: 'cascade' }),
    caseId: uuid('case_id')
      .notNull()
      .references(() => cases.id),
    subjectType: approvalSubject('subject_type').notNull(),
    subjectId: uuid('subject_id').notNull(),
    decision: approvalDecision('decision').notNull(),
    approvedAmount: money('approved_amount'),
    currency: currencyCol(),
    approverUserId: uuid('approver_user_id')
      .notNull()
      .references(() => users.id),
    approverRole: appRole('approver_role').notNull(),
    decidedAt: timestamp('decided_at', { withTimezone: true }).notNull().defaultNow(),
    rationale: text('rationale'),
    supersedesId: uuid('supersedes_id'),
    /** RN-02: la excepción de gobernanza se muestra destacada, nunca oculta. */
    isException: boolean('is_exception').notNull().default(false),
    exceptionReason: text('exception_reason'),
    ruleId: uuid('rule_id').references(() => governanceRules.id),
    createdAt,
  },
  (t) => [index('approvals_subject_idx').on(t.subjectType, t.subjectId), index('approvals_case_idx').on(t.caseId)],
);

export const woStatus = pgEnum('wo_status', ['draft', 'issued', 'in_progress', 'completed', 'accepted', 'cancelled']);

export const workOrders = pgTable(
  'work_orders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    buildingId: uuid('building_id')
      .notNull()
      .references(() => buildings.id, { onDelete: 'cascade' }),
    caseId: uuid('case_id')
      .notNull()
      .references(() => cases.id),
    vendorId: uuid('vendor_id')
      .notNull()
      .references(() => vendors.id),
    quoteId: uuid('quote_id').references(() => quotes.id),
    number: bigint('number', { mode: 'number' }).notNull(),
    scope: text('scope').notNull(),
    amount: money('amount'),
    currency: currencyCol(),
    budgetCategoryId: uuid('budget_category_id').references(() => budgetCategories.id),
    scheduledFor: date('scheduled_for'),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    status: woStatus('status').notNull().default('draft'),
    acceptanceByUserId: uuid('acceptance_by_user_id').references(() => users.id),
    acceptanceAt: timestamp('acceptance_at', { withTimezone: true }),
    acceptanceNotes: text('acceptance_notes'),
    createdAt,
    updatedAt,
    createdBy: uuid('created_by'),
  },
  (t) => [unique('work_orders_building_number_uq').on(t.buildingId, t.number), index('work_orders_case_idx').on(t.caseId)],
);

export const invoiceStatus = pgEnum('invoice_status', ['received', 'validated', 'rejected', 'paid']);

/** v1: registro y validación. Sin pagos ni conciliación (eso es v2). */
export const invoices = pgTable(
  'invoices',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    buildingId: uuid('building_id')
      .notNull()
      .references(() => buildings.id, { onDelete: 'cascade' }),
    caseId: uuid('case_id').references(() => cases.id),
    vendorId: uuid('vendor_id')
      .notNull()
      .references(() => vendors.id),
    workOrderId: uuid('work_order_id').references(() => workOrders.id),
    number: text('number').notNull(),
    issueDate: date('issue_date').notNull(),
    amount: money('amount').notNull(),
    currency: currencyCol().notNull().default('UYU'),
    budgetCategoryId: uuid('budget_category_id').references(() => budgetCategories.id),
    status: invoiceStatus('status').notNull().default('received'),
    validatedBy: uuid('validated_by').references(() => users.id),
    validatedAt: timestamp('validated_at', { withTimezone: true }),
    rejectionReason: text('rejection_reason'),
    documentId: uuid('document_id'),
    createdAt,
    updatedAt,
    createdBy: uuid('created_by'),
  },
  (t) => [index('invoices_case_idx').on(t.caseId), index('invoices_vendor_idx').on(t.vendorId, t.issueDate)],
);

export const decisionStatus = pgEnum('decision_status', ['pending', 'in_progress', 'done', 'cancelled']);
export const decisionBody = pgEnum('decision_body', ['comision', 'asamblea', 'administrador']);

export const decisions = pgTable(
  'decisions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    buildingId: uuid('building_id')
      .notNull()
      .references(() => buildings.id, { onDelete: 'cascade' }),
    caseId: uuid('case_id').references(() => cases.id),
    title: text('title').notNull(),
    body: text('body'),
    decidedOn: date('decided_on').notNull(),
    decidedBy: decisionBody('decided_by').notNull(),
    responsibleUserId: uuid('responsible_user_id').references(() => users.id),
    dueDate: date('due_date'),
    status: decisionStatus('status').notNull().default('pending'),
    minutesDocumentId: uuid('minutes_document_id'),
    createdAt,
    updatedAt,
    createdBy: uuid('created_by'),
  },
  (t) => [index('decisions_building_idx').on(t.buildingId, t.status)],
);

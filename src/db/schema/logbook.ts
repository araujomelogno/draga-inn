import { pgTable, uuid, text, date, timestamp, boolean, integer, numeric, jsonb, pgEnum, unique, index } from 'drizzle-orm/pg-core';
import { createdAt, updatedAt, money, currencyCol, clientUuid, frequency } from './_shared';
import { buildings } from './buildings';
import { users, parties } from './people';
import { cases } from './cases';
import { budgetCategories } from './procurement';

export type ChecklistItem = {
  key: string;
  label: string;
  /** RN-48: el cumplimiento se calcula SOLO sobre ítems requeridos. */
  required: boolean;
  section: string;
  /** RN-40: el ítem se refuerza o solo aplica en temporada alta. */
  seasonal?: boolean;
};

export const checklistTemplates = pgTable(
  'checklist_templates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    buildingId: uuid('building_id')
      .notNull()
      .references(() => buildings.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    freq: frequency('freq').notNull(),
    items: jsonb('items').$type<ChecklistItem[]>().notNull(),
    /** RN-40: la plantilla refuerza frecuencia en temporada alta. */
    seasonal: boolean('seasonal').notNull().default(false),
    active: boolean('active').notNull().default(true),
    createdAt,
    updatedAt,
    createdBy: uuid('created_by'),
  },
  (t) => [index('checklist_templates_building_idx').on(t.buildingId, t.active)],
);

export const checklistStatus = pgEnum('checklist_status', ['pending', 'partial', 'complete']);

export const checklistInstances = pgTable(
  'checklist_instances',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    buildingId: uuid('building_id')
      .notNull()
      .references(() => buildings.id, { onDelete: 'cascade' }),
    templateId: uuid('template_id')
      .notNull()
      .references(() => checklistTemplates.id),
    periodDate: date('period_date').notNull(),
    status: checklistStatus('status').notNull().default('pending'),
    assignedToUserId: uuid('assigned_to_user_id').references(() => users.id),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    clientUuid,
    createdAt,
    updatedAt,
    createdBy: uuid('created_by'),
  },
  (t) => [
    unique('checklist_instances_uq').on(t.templateId, t.periodDate),
    index('checklist_instances_date_idx').on(t.buildingId, t.periodDate),
  ],
);

export const checklistItemResults = pgTable(
  'checklist_item_results',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    buildingId: uuid('building_id')
      .notNull()
      .references(() => buildings.id, { onDelete: 'cascade' }),
    instanceId: uuid('instance_id')
      .notNull()
      .references(() => checklistInstances.id, { onDelete: 'cascade' }),
    itemKey: text('item_key').notNull(),
    label: text('label').notNull(),
    required: boolean('required').notNull().default(true),
    done: boolean('done').notNull().default(false),
    note: text('note'),
    photoDocumentId: uuid('photo_document_id'),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    completedBy: uuid('completed_by').references(() => users.id),
    clientUuid,
    createdAt,
    updatedAt,
  },
  (t) => [unique('checklist_item_results_uq').on(t.instanceId, t.itemKey)],
);

/** Anexo A del Manual. Rangos de referencia en `buildings.settings.pool` (nunca hardcodeados). */
export const poolLogs = pgTable(
  'pool_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    buildingId: uuid('building_id')
      .notNull()
      .references(() => buildings.id, { onDelete: 'cascade' }),
    caseId: uuid('case_id').references(() => cases.id),
    loggedOn: date('logged_on').notNull(),
    loggedAt: timestamp('logged_at', { withTimezone: true }).notNull().defaultNow(),
    freeChlorine: numeric('free_chlorine', { precision: 5, scale: 2 }),
    ph: numeric('ph', { precision: 4, scale: 2 }),
    alkalinity: numeric('alkalinity', { precision: 6, scale: 2 }),
    calciumHardness: numeric('calcium_hardness', { precision: 6, scale: 2 }),
    skimmed: boolean('skimmed'),
    basketsCleaned: boolean('baskets_cleaned'),
    productsApplied: text('products_applied'),
    observations: text('observations'),
    /** RN-43: distinguimos presente-correcto de presente-fuera-de-rango. */
    outOfRange: boolean('out_of_range').notNull().default(false),
    outOfRangeParams: text('out_of_range_params').array(),
    backdateReason: text('backdate_reason'),
    loggedBy: uuid('logged_by').references(() => users.id),
    clientUuid,
    createdAt,
    updatedAt,
  },
  (t) => [
    unique('pool_logs_slot_uq').on(t.buildingId, t.loggedOn, t.loggedAt),
    index('pool_logs_date_idx').on(t.buildingId, t.loggedOn),
  ],
);

export const trade = pgEnum('trade', ['masonry', 'electrical', 'carpentry', 'plumbing', 'painting', 'other']);

/** Anexo B: tareas de mantenimiento aprobadas por la Administración. */
export const approvedTaskLogs = pgTable(
  'approved_task_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    buildingId: uuid('building_id')
      .notNull()
      .references(() => buildings.id, { onDelete: 'cascade' }),
    caseId: uuid('case_id').references(() => cases.id),
    performedOn: date('performed_on').notNull(),
    trade: trade('trade').notNull(),
    description: text('description').notNull(),
    materials: text('materials'),
    timeSpentMinutes: integer('time_spent_minutes'),
    status: text('status').notNull().default('done'),
    /** RN-23: derivado a técnico ⇒ se ofrece crear ticket vinculado. */
    escalated: boolean('escalated').notNull().default(false),
    escalationReason: text('escalation_reason'),
    escalatedTicketId: uuid('escalated_ticket_id'),
    costAmount: money('cost_amount'),
    currency: currencyCol(),
    budgetCategoryId: uuid('budget_category_id').references(() => budgetCategories.id),
    loggedBy: uuid('logged_by').references(() => users.id),
    clientUuid,
    createdAt,
    updatedAt,
  },
  (t) => [index('approved_task_logs_date_idx').on(t.buildingId, t.performedOn)],
);

export const incidentType = pgEnum('incident_type', [
  'service_outage',
  'leak',
  'fire_start',
  'accident',
  'unauthorized_entry',
  'damage',
  'other',
]);

/** Anexo F: incidentes y emergencias. RN-25 notifica de inmediato en accidente e incendio. */
export const incidents = pgTable(
  'incidents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    buildingId: uuid('building_id')
      .notNull()
      .references(() => buildings.id, { onDelete: 'cascade' }),
    caseId: uuid('case_id').references(() => cases.id),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    incidentType: incidentType('incident_type').notNull(),
    description: text('description').notNull(),
    actionTaken: text('action_taken'),
    notifiedTo: text('notified_to'),
    status: text('status').notNull().default('open'),
    loggedBy: uuid('logged_by').references(() => users.id),
    clientUuid,
    createdAt,
    updatedAt,
  },
  (t) => [index('incidents_date_idx').on(t.buildingId, t.occurredAt)],
);

/** Anexo E: stock de insumos críticos. */
export const stockItems = pgTable(
  'stock_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    buildingId: uuid('building_id')
      .notNull()
      .references(() => buildings.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    unitOfMeasure: text('unit_of_measure'),
    minQuantity: numeric('min_quantity', { precision: 12, scale: 2 }).notNull().default('0'),
    currentQuantity: numeric('current_quantity', { precision: 12, scale: 2 }).notNull().default('0'),
    /** RN-26: se notifica una sola vez por artículo hasta que se repone. */
    lowStockNotifiedAt: timestamp('low_stock_notified_at', { withTimezone: true }),
    createdAt,
    updatedAt,
    createdBy: uuid('created_by'),
  },
  (t) => [index('stock_items_building_idx').on(t.buildingId)],
);

export const stockMovementKind = pgEnum('stock_movement_kind', ['in', 'out', 'adjust']);

export const stockMovements = pgTable(
  'stock_movements',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    buildingId: uuid('building_id')
      .notNull()
      .references(() => buildings.id, { onDelete: 'cascade' }),
    stockItemId: uuid('stock_item_id')
      .notNull()
      .references(() => stockItems.id),
    kind: stockMovementKind('kind').notNull(),
    quantity: numeric('quantity', { precision: 12, scale: 2 }).notNull(),
    reason: text('reason'),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
    loggedBy: uuid('logged_by').references(() => users.id),
    clientUuid,
    createdAt,
  },
  (t) => [index('stock_movements_item_idx').on(t.stockItemId, t.occurredAt)],
);

export const staffNoteKind = pgEnum('staff_note_kind', [
  'attendance',
  'leave',
  'day_off',
  'replacement',
  'training',
  'sanction',
]);

/** Anexo D: novedades del personal a cargo. */
export const staffNotes = pgTable(
  'staff_notes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    buildingId: uuid('building_id')
      .notNull()
      .references(() => buildings.id, { onDelete: 'cascade' }),
    partyId: uuid('party_id').references(() => parties.id),
    noteDate: date('note_date').notNull(),
    kind: staffNoteKind('kind').notNull(),
    description: text('description').notNull(),
    notifiedAdmin: boolean('notified_admin').notNull().default(false),
    loggedBy: uuid('logged_by').references(() => users.id),
    clientUuid,
    createdAt,
    updatedAt,
  },
  (t) => [index('staff_notes_date_idx').on(t.buildingId, t.noteDate)],
);

export type MonthlyReportContent = {
  tickets: { opened: number; closed: number; open: number; byCategory: Record<string, number> };
  maintenance: { planned: number; done: number; pending: number; overdue: number };
  /** RN-50: resumen de control del mes. */
  control: {
    planned: number;
    completed: number;
    pending: number;
    compliancePct: number;
    justification?: string;
  };
  pool: { logged: number; expected: number; outOfRange: number; missing: number };
  approvedTasks: { total: number; byTrade: Record<string, number>; escalationPct: number };
  incidents: { total: number; byType: Record<string, number> };
  spend: { total: string; currency: string; byCategory: Record<string, string> };
  stock: { belowMinimum: string[] };
  /** CB-10: los bloques sin datos se declaran explícitamente. */
  emptyBlocks: string[];
};

export const monthlyReportStatus = pgEnum('monthly_report_status', ['draft', 'submitted']);

/** RN-42: un informe enviado no se edita. Una corrección genera una versión nueva. */
export const monthlyReports = pgTable(
  'monthly_reports',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    buildingId: uuid('building_id')
      .notNull()
      .references(() => buildings.id, { onDelete: 'cascade' }),
    periodMonth: date('period_month').notNull(),
    version: integer('version').notNull().default(1),
    supersedesId: uuid('supersedes_id'),
    status: monthlyReportStatus('status').notNull().default('draft'),
    content: jsonb('content').$type<MonthlyReportContent>().notNull(),
    narrative: text('narrative'),
    controlJustification: text('control_justification'),
    generatedAt: timestamp('generated_at', { withTimezone: true }).notNull().defaultNow(),
    submittedAt: timestamp('submitted_at', { withTimezone: true }),
    submittedBy: uuid('submitted_by').references(() => users.id),
    pdfDocumentId: uuid('pdf_document_id'),
    createdAt,
    updatedAt,
    createdBy: uuid('created_by'),
  },
  (t) => [unique('monthly_reports_uq').on(t.buildingId, t.periodMonth, t.version)],
);

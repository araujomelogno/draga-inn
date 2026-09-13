import { pgTable, uuid, text, bigint, date, timestamp, boolean, pgEnum, unique, index } from 'drizzle-orm/pg-core';
import { createdAt, updatedAt, clientUuid } from './_shared';
import { buildings, units, commonAreas } from './buildings';
import { users } from './people';
import { cases } from './cases';

export const ticketStatus = pgEnum('ticket_status', [
  'new',
  'triage',
  'assigned',
  'in_progress',
  'waiting_owner',
  'resolved',
  'closed',
]);

export const ticketPriority = pgEnum('ticket_priority', ['low', 'normal', 'high', 'critical']);
export const ticketSource = pgEnum('ticket_source', ['portal', 'pwa', 'admin', 'whatsapp', 'system']);

export const tickets = pgTable(
  'tickets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    buildingId: uuid('building_id')
      .notNull()
      .references(() => buildings.id, { onDelete: 'cascade' }),
    caseId: uuid('case_id')
      .notNull()
      .references(() => cases.id),
    number: bigint('number', { mode: 'number' }).notNull(),
    unitId: uuid('unit_id').references(() => units.id, { onDelete: 'set null' }),
    commonAreaId: uuid('common_area_id').references(() => commonAreas.id),
    assetId: uuid('asset_id'),
    title: text('title').notNull(),
    description: text('description'),
    category: text('category').notNull(),
    priority: ticketPriority('priority').notNull().default('normal'),
    status: ticketStatus('status').notNull().default('new'),
    reportedByUserId: uuid('reported_by_user_id').references(() => users.id),
    assignedToUserId: uuid('assigned_to_user_id').references(() => users.id),
    vendorId: uuid('vendor_id'),
    dueDate: date('due_date'),
    resolutionNote: text('resolution_note'),
    /** CB-14: se conserva la referencia textual si la unidad se borró mientras el ticket estaba encolado. */
    detachedUnitNote: text('detached_unit_note'),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    closeReason: text('close_reason'),
    reopenedCount: bigint('reopened_count', { mode: 'number' }).notNull().default(0),
    source: ticketSource('source').notNull().default('admin'),
    clientUuid,
    createdAt,
    updatedAt,
    createdBy: uuid('created_by').references(() => users.id),
  },
  (t) => [
    unique('tickets_building_number_uq').on(t.buildingId, t.number),
    index('tickets_building_status_idx').on(t.buildingId, t.status),
    index('tickets_assignee_idx').on(t.assignedToUserId),
    index('tickets_unit_idx').on(t.unitId),
  ],
);

export const ticketComments = pgTable(
  'ticket_comments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    buildingId: uuid('building_id')
      .notNull()
      .references(() => buildings.id, { onDelete: 'cascade' }),
    ticketId: uuid('ticket_id')
      .notNull()
      .references(() => tickets.id, { onDelete: 'cascade' }),
    authorUserId: uuid('author_user_id').references(() => users.id),
    body: text('body').notNull(),
    /** RN-14: true ⇒ jamás visible al propietario por ninguna vía. */
    isInternal: boolean('is_internal').notNull().default(false),
    clientUuid,
    createdAt,
  },
  (t) => [index('ticket_comments_ticket_idx').on(t.ticketId, t.createdAt)],
);

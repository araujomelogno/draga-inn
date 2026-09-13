import { pgTable, uuid, text, bigint, timestamp, jsonb, pgEnum, unique, index } from 'drizzle-orm/pg-core';
import { createdAt, updatedAt } from './_shared';
import { buildings, units } from './buildings';
import { users } from './people';

export const caseStatus = pgEnum('case_status', [
  'open',
  'in_progress',
  'waiting',
  'resolved',
  'closed',
  'cancelled',
]);

/** Regla 1: todo hecho pertenece a un expediente. */
export const cases = pgTable(
  'cases',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    buildingId: uuid('building_id')
      .notNull()
      .references(() => buildings.id, { onDelete: 'cascade' }),
    number: bigint('number', { mode: 'number' }).notNull(),
    title: text('title').notNull(),
    category: text('category'),
    status: caseStatus('status').notNull().default('open'),
    unitId: uuid('unit_id').references(() => units.id),
    assetId: uuid('asset_id'),
    summary: text('summary'),
    openedBy: uuid('opened_by').references(() => users.id),
    openedAt: timestamp('opened_at', { withTimezone: true }).notNull().defaultNow(),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    createdAt,
    updatedAt,
    createdBy: uuid('created_by'),
  },
  (t) => [
    unique('cases_building_number_uq').on(t.buildingId, t.number),
    index('cases_building_status_idx').on(t.buildingId, t.status),
  ],
);

export type CaseEventType =
  | 'case_opened'
  | 'case_status_changed'
  | 'case_closed'
  | 'ticket_created'
  | 'ticket_status_changed'
  | 'ticket_comment'
  | 'ticket_assigned'
  | 'quote_submitted'
  | 'approval_recorded'
  | 'governance_exception'
  | 'work_order_issued'
  | 'work_order_accepted'
  | 'invoice_received'
  | 'invoice_validated'
  | 'document_linked'
  | 'decision_recorded'
  | 'pool_log_recorded'
  | 'approved_task_logged'
  | 'incident_logged'
  | 'maintenance_task_completed'
  | 'compensating_event';

/**
 * Línea de tiempo append-only del expediente.
 * Nunca se hace UPDATE ni DELETE: se revoca con un evento compensatorio.
 */
export const caseEvents = pgTable(
  'case_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    buildingId: uuid('building_id')
      .notNull()
      .references(() => buildings.id, { onDelete: 'cascade' }),
    caseId: uuid('case_id')
      .notNull()
      .references(() => cases.id, { onDelete: 'cascade' }),
    eventType: text('event_type').$type<CaseEventType>().notNull(),
    entityType: text('entity_type'),
    entityId: uuid('entity_id'),
    actorUserId: uuid('actor_user_id').references(() => users.id),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
    note: text('note'),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
  },
  (t) => [index('case_events_case_time_idx').on(t.caseId, t.occurredAt)],
);

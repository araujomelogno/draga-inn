import { pgTable, uuid, text, date, timestamp, boolean, integer, jsonb, pgEnum, unique, index } from 'drizzle-orm/pg-core';
import { createdAt, updatedAt, money, currencyCol, clientUuid, frequency } from './_shared';
import { buildings } from './buildings';
import { users } from './people';
import { cases } from './cases';

export const criticality = pgEnum('criticality', ['low', 'normal', 'critical']);
export const assetStatus = pgEnum('asset_status', ['active', 'inactive', 'decommissioned']);

export const assets = pgTable(
  'assets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    buildingId: uuid('building_id')
      .notNull()
      .references(() => buildings.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    category: text('category').notNull(),
    location: text('location'),
    serialNumber: text('serial_number'),
    installedOn: date('installed_on'),
    vendorId: uuid('vendor_id'),
    warrantyUntil: date('warranty_until'),
    criticality: criticality('criticality').notNull().default('normal'),
    status: assetStatus('status').notNull().default('active'),
    specs: jsonb('specs').$type<Record<string, unknown>>().notNull().default({}),
    createdAt,
    updatedAt,
    createdBy: uuid('created_by'),
  },
  (t) => [index('assets_building_idx').on(t.buildingId, t.category)],
);

export const maintenancePlans = pgTable(
  'maintenance_plans',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    buildingId: uuid('building_id')
      .notNull()
      .references(() => buildings.id, { onDelete: 'cascade' }),
    assetId: uuid('asset_id').references(() => assets.id),
    name: text('name').notNull(),
    freq: frequency('freq').notNull(),
    intervalCount: integer('interval_count').notNull().default(1),
    startDate: date('start_date').notNull(),
    active: boolean('active').notNull().default(true),
    defaultAssigneeId: uuid('default_assignee_id').references(() => users.id),
    checklist: jsonb('checklist').$type<string[]>().notNull().default([]),
    createdAt,
    updatedAt,
    createdBy: uuid('created_by'),
  },
  (t) => [index('maintenance_plans_building_idx').on(t.buildingId, t.active)],
);

export const taskStatus = pgEnum('task_status', ['pending', 'done', 'overdue', 'skipped']);

export const maintenanceTasks = pgTable(
  'maintenance_tasks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    buildingId: uuid('building_id')
      .notNull()
      .references(() => buildings.id, { onDelete: 'cascade' }),
    planId: uuid('plan_id').references(() => maintenancePlans.id),
    assetId: uuid('asset_id').references(() => assets.id),
    caseId: uuid('case_id').references(() => cases.id),
    title: text('title').notNull(),
    dueDate: date('due_date').notNull(),
    status: taskStatus('status').notNull().default('pending'),
    assignedToUserId: uuid('assigned_to_user_id').references(() => users.id),
    completedByUserId: uuid('completed_by_user_id').references(() => users.id),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    notes: text('notes'),
    skipReason: text('skip_reason'),
    costAmount: money('cost_amount'),
    currency: currencyCol(),
    budgetCategoryId: uuid('budget_category_id'),
    clientUuid,
    createdAt,
    updatedAt,
    createdBy: uuid('created_by'),
  },
  (t) => [
    unique('maintenance_tasks_plan_due_uq').on(t.planId, t.dueDate),
    index('maintenance_tasks_due_idx').on(t.buildingId, t.dueDate, t.status),
  ],
);

export const assetEventType = pgEnum('asset_event_type', ['failure', 'repair', 'inspection', 'replacement']);

export const assetEvents = pgTable(
  'asset_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    buildingId: uuid('building_id')
      .notNull()
      .references(() => buildings.id, { onDelete: 'cascade' }),
    assetId: uuid('asset_id')
      .notNull()
      .references(() => assets.id, { onDelete: 'cascade' }),
    caseId: uuid('case_id').references(() => cases.id),
    eventType: assetEventType('event_type').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
    description: text('description'),
    costAmount: money('cost_amount'),
    currency: currencyCol(),
    createdAt,
    createdBy: uuid('created_by').references(() => users.id),
  },
  (t) => [index('asset_events_asset_idx').on(t.assetId, t.occurredAt)],
);

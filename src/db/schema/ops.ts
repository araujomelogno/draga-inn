import { pgTable, uuid, text, date, timestamp, boolean, integer, bigint, numeric, jsonb, pgEnum, unique, index } from 'drizzle-orm/pg-core';
import { createdAt } from './_shared';
import { buildings } from './buildings';
import { users } from './people';

/** RN-19: inmutable y de solo lectura para todos. Escrita por triggers, jamás por la app. */
export const auditLog = pgTable(
  'audit_log',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    buildingId: uuid('building_id'),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
    actorUserId: uuid('actor_user_id'),
    actorRole: text('actor_role'),
    entityType: text('entity_type').notNull(),
    entityId: uuid('entity_id'),
    action: text('action').notNull(),
    before: jsonb('before'),
    after: jsonb('after'),
    changedFields: text('changed_fields').array(),
    requestId: text('request_id'),
  },
  (t) => [
    index('audit_log_building_time_idx').on(t.buildingId, t.occurredAt),
    index('audit_log_entity_idx').on(t.entityType, t.entityId),
  ],
);

export const notificationChannel = pgEnum('notification_channel', ['email', 'inapp', 'whatsapp']);
export const notificationStatus = pgEnum('notification_status', ['pending', 'sent', 'failed', 'suppressed']);

export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    buildingId: uuid('building_id')
      .notNull()
      .references(() => buildings.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    notifType: text('notif_type').notNull(),
    title: text('title').notNull(),
    body: text('body'),
    entityType: text('entity_type'),
    entityId: uuid('entity_id'),
    channel: notificationChannel('channel').notNull().default('email'),
    status: notificationStatus('status').notNull().default('pending'),
    /** RN-33: las agrupadas se juntan y se despachan una vez al día a las 08:00. */
    digestKey: text('digest_key'),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    readAt: timestamp('read_at', { withTimezone: true }),
    createdAt,
  },
  (t) => [index('notifications_user_idx').on(t.userId, t.createdAt), index('notifications_status_idx').on(t.status)],
);

export const outboxStatus = pgEnum('outbox_status', ['pending', 'processing', 'done', 'failed']);

/** Despacho confiable: la transacción de negocio y el envío no comparten destino. */
export const outbox = pgTable(
  'outbox',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    buildingId: uuid('building_id').references(() => buildings.id, { onDelete: 'cascade' }),
    topic: text('topic').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
    status: outboxStatus('status').notNull().default('pending'),
    attempts: integer('attempts').notNull().default(0),
    availableAt: timestamp('available_at', { withTimezone: true }).notNull().defaultNow(),
    lastError: text('last_error'),
    createdAt,
    processedAt: timestamp('processed_at', { withTimezone: true }),
  },
  (t) => [index('outbox_status_idx').on(t.status, t.availableAt)],
);

export const dayStatus = pgEnum('day_status', ['complete', 'partial', 'missing']);

/** RN-43: presente-y-correcto, presente-fuera-de-rango y faltante se computan distinto. */
export const complianceSnapshots = pgTable(
  'compliance_snapshots',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    buildingId: uuid('building_id')
      .notNull()
      .references(() => buildings.id, { onDelete: 'cascade' }),
    snapshotDate: date('snapshot_date').notNull(),
    requiredItems: integer('required_items').notNull().default(0),
    completedItems: integer('completed_items').notNull().default(0),
    compliancePct: numeric('compliance_pct', { precision: 5, scale: 2 }).notNull().default('0'),
    dayStatus: dayStatus('day_status').notNull(),
    /** RN-52: null = fuera de temporada de piscina, no cuenta como faltante. */
    poolLogged: boolean('pool_logged'),
    poolOutOfRange: boolean('pool_out_of_range'),
    missingStreakDays: integer('missing_streak_days').notNull().default(0),
    missingItemKeys: text('missing_item_keys').array(),
    computedAt: timestamp('computed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('compliance_snapshots_uq').on(t.buildingId, t.snapshotDate),
    index('compliance_snapshots_date_idx').on(t.buildingId, t.snapshotDate),
  ],
);

/** Marca de idempotencia de los jobs (CB-13: reejecución segura ante cambio de horario). */
export const jobRuns = pgTable(
  'job_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    jobName: text('job_name').notNull(),
    runKey: text('run_key').notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    status: text('status').notNull().default('running'),
    result: jsonb('result').$type<Record<string, unknown>>(),
    error: text('error'),
  },
  (t) => [unique('job_runs_uq').on(t.jobName, t.runKey)],
);

/** Idempotencia del lote offline: registra el resultado por client_uuid (HANDOFF §6.2). */
export const syncReceipts = pgTable(
  'sync_receipts',
  {
    clientUuid: uuid('client_uuid').primaryKey(),
    buildingId: uuid('building_id')
      .notNull()
      .references(() => buildings.id, { onDelete: 'cascade' }),
    endpoint: text('endpoint').notNull(),
    entityType: text('entity_type'),
    entityId: uuid('entity_id'),
    result: text('result').notNull(),
    createdAt,
  },
  (t) => [index('sync_receipts_building_idx').on(t.buildingId, t.createdAt)],
);

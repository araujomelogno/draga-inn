import { pgTable, uuid, text, char, boolean, timestamp, pgEnum, unique, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { createdAt, updatedAt, appRole } from './_shared';
import { buildings, units } from './buildings';

export const partyKind = pgEnum('party_kind', ['person', 'company']);

export const parties = pgTable(
  'parties',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    buildingId: uuid('building_id')
      .notNull()
      .references(() => buildings.id, { onDelete: 'cascade' }),
    kind: partyKind('kind').notNull().default('person'),
    fullName: text('full_name').notNull(),
    docType: text('doc_type'),
    docNumber: text('doc_number'),
    email: text('email'),
    phone: text('phone'),
    country: char('country', { length: 2 }),
    notes: text('notes'),
    createdAt,
    updatedAt,
    createdBy: uuid('created_by'),
  },
  (t) => [index('parties_building_idx').on(t.buildingId), index('parties_email_idx').on(t.email)],
);

export const occupancyRole = pgEnum('occupancy_role', ['owner', 'tenant', 'occupant']);

/**
 * RN-03: la titularidad nunca se sobrescribe. Se cierra un período y se abre otro.
 * `period` es un daterange `[desde, hasta)`; hasta = null ⇒ vigente.
 * La exclusión GiST impide dos titulares principales solapados en la misma unidad.
 */
export const unitOccupancies = pgTable(
  'unit_occupancies',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    buildingId: uuid('building_id')
      .notNull()
      .references(() => buildings.id, { onDelete: 'cascade' }),
    unitId: uuid('unit_id')
      .notNull()
      .references(() => units.id, { onDelete: 'cascade' }),
    partyId: uuid('party_id')
      .notNull()
      .references(() => parties.id),
    role: occupancyRole('role').notNull(),
    period: text('period').notNull(), // daterange — se opera con SQL crudo tipado
    isPrimary: boolean('is_primary').notNull().default(true),
    createdAt,
    updatedAt,
    createdBy: uuid('created_by'),
  },
  (t) => [index('unit_occupancies_unit_role_idx').on(t.unitId, t.role)],
);

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    firebaseUid: text('firebase_uid').notNull().unique(),
    email: text('email').notNull(),
    displayName: text('display_name'),
    partyId: uuid('party_id').references(() => parties.id),
    isActive: boolean('is_active').notNull().default(true),
    /** RN-34: preferencias de notificación. Las críticas no se pueden apagar. */
    notificationPrefs: text('notification_prefs').array().notNull().default(sql`'{}'::text[]`),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
    createdAt,
    updatedAt,
  },
  (t) => [index('users_email_idx').on(t.email)],
);

/** Un usuario puede tener varios roles en un edificio (CB-11). */
export const memberships = pgTable(
  'memberships',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    buildingId: uuid('building_id')
      .notNull()
      .references(() => buildings.id, { onDelete: 'cascade' }),
    role: appRole('role').notNull(),
    isActive: boolean('is_active').notNull().default(true),
    createdAt,
    updatedAt,
    createdBy: uuid('created_by'),
  },
  (t) => [unique('memberships_uq').on(t.userId, t.buildingId, t.role)],
);

/** Invitaciones pendientes: permiten resolver el alta al primer login (HANDOFF §4.1 paso 4). */
export const invitations = pgTable(
  'invitations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    buildingId: uuid('building_id')
      .notNull()
      .references(() => buildings.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    role: appRole('role').notNull(),
    partyId: uuid('party_id').references(() => parties.id),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    createdAt,
    createdBy: uuid('created_by'),
  },
  (t) => [unique('invitations_uq').on(t.buildingId, t.email, t.role)],
);

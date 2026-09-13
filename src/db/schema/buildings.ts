import { pgTable, uuid, text, char, jsonb, boolean, numeric, pgEnum, unique, index } from 'drizzle-orm/pg-core';
import { createdAt, updatedAt } from './_shared';

export type BuildingSettings = {
  /** RN-40: ventanas de temporada alta. */
  season?: { highFrom: string; highTo: string; extraHighRanges?: { from: string; to: string; label: string }[] };
  /** Rangos de referencia de piscina (RN-21, RN-22). Nunca hardcodeados. */
  pool?: Record<string, { min: number; max: number; criticalMin?: number; criticalMax?: number; label: string; unit: string }>;
  /** RN-47: umbral de magnitud acumulada para avisar tendencia. */
  poolTrend?: Record<string, number>;
  /** RN-16: tolerancia porcentual de factura sobre monto aprobado. */
  invoiceTolerancePct?: number;
  /** RN-11: días para cierre automático de tickets resueltos. */
  ticketAutoCloseDays?: number;
  /** RN-12: ventana de reapertura por el propietario. */
  ticketReopenDays?: number;
  /** RN-44: hora local de corte del checklist diario. */
  dailyCutoffHour?: number;
  /** CB-02: días hacia atrás admitidos sin justificación en planillas. */
  backdateGraceDays?: number;
  /** RN-46: umbral de omisión sistemática. */
  omittedItemThresholdPct?: number;
  /** Habilita el campo de costo en tareas aprobadas (ESPEC §4.4). */
  approvedTaskCostEnabled?: boolean;
};

export const buildings = pgTable('buildings', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  legalName: text('legal_name'),
  address: text('address'),
  city: text('city').default('Punta del Este'),
  department: text('department').default('Maldonado'),
  country: char('country', { length: 2 }).default('UY'),
  timezone: text('timezone').notNull().default('America/Montevideo'),
  currency: char('currency', { length: 3 }).notNull().default('UYU'),
  settings: jsonb('settings').$type<BuildingSettings>().notNull().default({}),
  createdAt,
  updatedAt,
});

export const sectorKind = pgEnum('sector_kind', ['tower', 'block', 'sector']);

export const sectors = pgTable('sectors', {
  id: uuid('id').primaryKey().defaultRandom(),
  buildingId: uuid('building_id')
    .notNull()
    .references(() => buildings.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  kind: sectorKind('kind').notNull().default('tower'),
  createdAt,
});

export const unitType = pgEnum('unit_type', ['apartment', 'parking', 'storage', 'commercial', 'common']);

export const units = pgTable(
  'units',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    buildingId: uuid('building_id')
      .notNull()
      .references(() => buildings.id, { onDelete: 'cascade' }),
    sectorId: uuid('sector_id').references(() => sectors.id),
    code: text('code').notNull(),
    unitType: unitType('unit_type').notNull().default('apartment'),
    floor: text('floor'),
    coefficient: numeric('coefficient', { precision: 7, scale: 4 }),
    areaM2: numeric('area_m2', { precision: 10, scale: 2 }),
    parentUnitId: uuid('parent_unit_id'),
    notes: text('notes'),
    createdAt,
    updatedAt,
    createdBy: uuid('created_by'),
  },
  (t) => [unique('units_building_code_uq').on(t.buildingId, t.code), index('units_building_idx').on(t.buildingId)],
);

export const commonAreas = pgTable('common_areas', {
  id: uuid('id').primaryKey().defaultRandom(),
  buildingId: uuid('building_id')
    .notNull()
    .references(() => buildings.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  kind: text('kind'),
  bookable: boolean('bookable').notNull().default(false),
  createdAt,
});

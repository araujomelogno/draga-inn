import { pgEnum, timestamp, uuid, char, numeric } from 'drizzle-orm/pg-core';

/** Roles de aplicación (ESPEC §7). */
export const appRole = pgEnum('app_role', [
  'owner',
  'tenant',
  'encargado',
  'administrador',
  'comision',
  'contador',
  'auditor',
]);

export const frequency = pgEnum('frequency', [
  'daily',
  'weekly',
  'monthly',
  'quarterly',
  'biannual',
  'annual',
  'seasonal',
]);

/** Columnas presentes en toda tabla de dominio (regla 3 de CLAUDE.md). */
export const createdAt = timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
export const updatedAt = timestamp('updated_at', { withTimezone: true }).notNull().defaultNow();

/** Regla 4: todo hecho económico lleva monto, moneda y rubro. */
export const money = (name: string) => numeric(name, { precision: 14, scale: 2 });
export const currencyCol = (name = 'currency') => char(name, { length: 3 });
export const clientUuid = uuid('client_uuid').unique();

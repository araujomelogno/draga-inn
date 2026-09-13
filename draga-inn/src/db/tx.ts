import type { PoolClient } from 'pg';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { sql } from 'drizzle-orm';
import { getPool, schema } from './client';
import type { AuthContext } from '@/auth/context';

/** Handle de Drizzle atado a UN cliente del pool, para que la transacción sea real. */
export type Tx = NodePgDatabase<typeof schema> & { raw: PoolClient };

/**
 * Única puerta de escritura del sistema (CLAUDE.md, regla 2).
 *
 * Abre la transacción declarando quién actúa: `SET LOCAL app.user_id`,
 * `app.user_role` y `app.request_id` son lo que alimenta los triggers de
 * auditoría de la base. Una escritura que no pase por acá genera un registro
 * sin autor y rompe la trazabilidad.
 */
export async function withTx<T>(ctx: AuthContext, fn: (tx: Tx) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('begin');
    // set_config con parámetros: evita interpolar strings en el SQL de sesión
    await client.query('select set_config($1, $2, true)', ['app.user_id', ctx.user.id]);
    await client.query('select set_config($1, $2, true)', ['app.user_role', ctx.roles[0] ?? '']);
    await client.query('select set_config($1, $2, true)', ['app.request_id', ctx.requestId]);

    const db = drizzle(client, { schema, casing: 'snake_case' }) as unknown as Tx;
    db.raw = client;

    const result = await fn(db);
    await client.query('commit');
    return result;
  } catch (err) {
    await client.query('rollback').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Lectura sin transacción de escritura. No declara actor porque no audita.
 * Igual filtra siempre por `building_id` en los repositorios (regla 3).
 */
export async function withRead<T>(fn: (db: Tx) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    const db = drizzle(client, { schema, casing: 'snake_case' }) as unknown as Tx;
    db.raw = client;
    return await fn(db);
  } finally {
    client.release();
  }
}

/** Correlativo por edificio: cases.number, tickets.number, work_orders.number. */
export async function nextNumber(tx: Tx, buildingId: string, entity: 'cases' | 'tickets' | 'work_orders'): Promise<number> {
  const rows = await tx.execute(
    sql`select fn_next_number(${buildingId}::uuid, ${entity}) as n`,
  );
  const first = (rows.rows as { n: string | number }[])[0];
  return Number(first?.n ?? 1);
}

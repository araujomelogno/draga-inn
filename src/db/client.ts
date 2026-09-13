import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from './schema';

/**
 * Cliente de base de datos. NO se importa desde módulos de dominio ni desde
 * componentes: la única puerta de escritura es `withTx()` (src/db/tx.ts).
 * La regla de ESLint en eslint.config.mjs lo enforza.
 */
let _pool: Pool | undefined;

export function getPool(): Pool {
  if (!_pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('Falta DATABASE_URL. Copiá .env.example a .env y completalo.');
    }
    _pool = new Pool({
      connectionString,
      max: Number(process.env.DATABASE_POOL_MAX ?? 10),
      ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: true } : undefined,
      // Cloud Run: el conector de Cloud SQL usa socket Unix, no hace falta keepalive agresivo
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
      application_name: 'draga-inn',
    });
  }
  return _pool;
}

export function getDb() {
  return drizzle(getPool(), { schema, casing: 'snake_case' });
}

export type Db = ReturnType<typeof getDb>;
export { schema };

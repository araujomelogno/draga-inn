/**
 * Prepara la base UNA vez por corrida: la deja vacía, aplica las migraciones
 * desde cero y siembra. Así los tests de integración corren siempre contra el
 * mismo punto de partida y se verifica, de paso, que migrar desde cero funciona.
 *
 * Sin DATABASE_URL no hace nada: los tests de integración se saltean solos.
 */
import { getPool } from '@/db/client';
import { migrate } from '@/db/migrate';
import { seed } from '@/db/seed';

export async function setup(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    process.stdout.write('\n⚠ Sin DATABASE_URL: se saltean los tests de integración.\n');
    return;
  }
  const pool = getPool();
  await pool.query('drop schema if exists public cascade');
  await pool.query('create schema public');
  await migrate();
  await seed();
  await pool.end();
}

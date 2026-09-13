import { afterAll } from 'vitest';
import { getPool } from '@/db/client';

/**
 * El pool se cierra una sola vez por archivo de test, al final de todo.
 * Cerrarlo dentro de cada `describe` rompe los `describe` siguientes.
 */
afterAll(async () => {
  await getPool().end().catch(() => undefined);
});

import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import type { AuthContext } from '@/auth/context';
import { withRead, withTx, type Tx } from '@/db/tx';
import { buildings, jobRuns } from '@/db/schema';
import { SYSTEM_USER_ID } from '@/api/handler';

/** Contexto de los jobs: el actor es el sistema, y queda así en la auditoría. */
export async function systemContext(buildingId: string, requestId = randomUUID()): Promise<AuthContext> {
  const [building] = await withRead((db) => db.select().from(buildings).where(eq(buildings.id, buildingId)).limit(1));
  if (!building) throw new Error(`Edificio ${buildingId} inexistente.`);
  return {
    user: { id: SYSTEM_USER_ID, email: 'sistema@dragainn.uy', displayName: 'Sistema' },
    buildingId,
    buildingSettings: building.settings,
    buildingTimezone: building.timezone,
    buildingCurrency: building.currency ?? 'UYU',
    roles: ['administrador'],
    unitIds: [],
    requestId,
  };
}

export async function allBuildings(): Promise<{ id: string; name: string; timezone: string }[]> {
  return withRead((db) => db.select({ id: buildings.id, name: buildings.name, timezone: buildings.timezone }).from(buildings));
}

/**
 * Todos los jobs son idempotentes ante reejecución (CB-13). `runKey` identifica
 * la corrida lógica (jobName + fecha local + edificio); si ya corrió, se saltea.
 */
export async function once<T extends Record<string, unknown>>(
  ctx: AuthContext,
  jobName: string,
  runKey: string,
  fn: (tx: Tx) => Promise<T>,
): Promise<{ skipped: boolean; result?: T }> {
  const claimed = await withTx(ctx, async (tx) => {
    const inserted = await tx.insert(jobRuns).values({ jobName, runKey }).onConflictDoNothing().returning({ id: jobRuns.id });
    return inserted[0]?.id ?? null;
  });
  if (!claimed) return { skipped: true };

  try {
    const result = await withTx(ctx, fn);
    await withTx(ctx, async (tx) => {
      await tx.update(jobRuns).set({ status: 'done', finishedAt: new Date(), result }).where(eq(jobRuns.id, claimed));
    });
    return { skipped: false, result };
  } catch (err) {
    await withTx(ctx, async (tx) => {
      await tx.update(jobRuns).set({ status: 'failed', finishedAt: new Date(), error: (err as Error).message }).where(eq(jobRuns.id, claimed));
    });
    throw err;
  }
}

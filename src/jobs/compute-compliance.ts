import { and, desc, eq, lte } from 'drizzle-orm';
import { complianceSnapshots } from '@/db/schema';
import { withTx } from '@/db/tx';
import { computeDay, upsertSnapshot } from '@/modules/compliance/service';
import { addDays, localDate } from '@/shared/dates';
import { enqueue } from '@/modules/notifications/outbox';
import { allBuildings, once, systemContext } from './context';

/**
 * Diario 20:00 UY — calcula la instantánea del día y dispara RN-44 y RN-45.
 *
 * RN-44: checklist sin completar al cierre ⇒ el día se marca incompleto y se
 *        notifica SOLO al encargado.
 * RN-45: dos días consecutivos incompletos ⇒ administrador.
 *        Siete días sin ningún registro ⇒ administrador y comisión.
 *
 * Idempotente por `unique (building_id, snapshot_date)`.
 */
export async function computeCompliance(forDate?: string): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {};

  for (const building of await allBuildings()) {
    const ctx = await systemContext(building.id);
    const date = forDate ?? localDate(new Date(), ctx.buildingTimezone);

    const r = await once(ctx, 'compute-compliance', `${building.id}:${date}`, async (tx) => {
      const day = await computeDay(tx, ctx, date);
      await upsertSnapshot(tx, ctx, day);

      // RN-44 — solo al encargado.
      if (day.dayStatus !== 'complete') {
        await enqueue(tx, building.id, 'compliance.day_incomplete', {
          date, missing: day.missingItemKeys.slice(0, 20), pct: day.compliancePct, audience: 'encargado',
        });
      }

      // RN-45 — dos días consecutivos incompletos escalan al administrador.
      const recent = await tx
        .select({ date: complianceSnapshots.snapshotDate, status: complianceSnapshots.dayStatus, streak: complianceSnapshots.missingStreakDays })
        .from(complianceSnapshots)
        .where(and(eq(complianceSnapshots.buildingId, building.id), lte(complianceSnapshots.snapshotDate, date)))
        .orderBy(desc(complianceSnapshots.snapshotDate))
        .limit(7);

      const [d0, d1] = recent;
      if (d0 && d1 && d0.status !== 'complete' && d1.status !== 'complete' && d1.date === addDays(date, -1)) {
        await enqueue(tx, building.id, 'compliance.two_days', { dates: [d1.date, d0.date], audience: 'administrador' });
      }

      // RN-45 — siete días consecutivos sin ningún registro.
      if ((d0?.streak ?? 0) >= 7) {
        await enqueue(tx, building.id, 'compliance.seven_days', {
          since: addDays(date, -(d0!.streak - 1)), audience: 'administrador,comision',
        });
      }

      return { date, dayStatus: day.dayStatus, pct: day.compliancePct, missing: day.missingItemKeys.length };
    });
    out[building.name] = r.skipped ? 'ya computado' : r.result;
  }
  return out;
}

/** Recalcula un rango, para poblar histórico o corregir un hueco de computación. */
export async function backfillCompliance(buildingId: string, from: string, to: string): Promise<number> {
  const ctx = await systemContext(buildingId);
  let n = 0;
  // Hacia adelante: la racha de cada día se encadena con la del anterior.
  for (let d = from; d <= to; d = addDays(d, 1)) {
    await withTx(ctx, async (tx) => {
      const day = await computeDay(tx, ctx, d);
      await upsertSnapshot(tx, ctx, day);
    });
    n += 1;
  }
  return n;
}

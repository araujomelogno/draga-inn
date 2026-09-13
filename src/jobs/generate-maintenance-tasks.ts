import { and, eq } from 'drizzle-orm';
import { maintenancePlans } from '@/db/schema';
import { materializePlan } from '@/modules/maintenance/service';
import { localDate } from '@/shared/dates';
import { allBuildings, once, systemContext } from './context';

/**
 * Diario 03:00 UY — materializa tareas de los planes activos para los próximos
 * 60 días. Idempotente por `unique (plan_id, due_date)`: reejecutar no duplica.
 */
export async function generateMaintenanceTasks(horizonDays = 60): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const building of await allBuildings()) {
    const ctx = await systemContext(building.id);
    const today = localDate(new Date(), ctx.buildingTimezone);
    const r = await once(ctx, 'generate-maintenance-tasks', `${building.id}:${today}`, async (tx) => {
      const plans = await tx.select().from(maintenancePlans)
        .where(and(eq(maintenancePlans.buildingId, building.id), eq(maintenancePlans.active, true)));
      let created = 0;
      for (const plan of plans) created += await materializePlan(tx, ctx, plan, horizonDays, today);
      return { created, plans: plans.length };
    });
    out[building.name] = r.skipped ? 0 : (r.result?.created ?? 0);
  }
  return out;
}

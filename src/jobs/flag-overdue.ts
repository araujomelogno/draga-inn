import { sql } from 'drizzle-orm';
import { localDate } from '@/shared/dates';
import { enqueue } from '@/modules/notifications/outbox';
import { allBuildings, once, systemContext } from './context';

/**
 * Diario 04:00 UY — RN-24: una tarea pasa a `overdue` a las 00:00 del día
 * siguiente a su vencimiento. Alimenta el tablero.
 */
export async function flagOverdue(): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const building of await allBuildings()) {
    const ctx = await systemContext(building.id);
    const today = localDate(new Date(), ctx.buildingTimezone);

    const r = await once(ctx, 'flag-overdue', `${building.id}:${today}`, async (tx) => {
      const { rows } = await tx.execute(sql`
        update maintenance_tasks
           set status = 'overdue'
         where building_id = ${building.id} and status = 'pending' and due_date < ${today}::date
        returning id, title, due_date, assigned_to_user_id`);

      if (rows.length > 0) {
        await enqueue(tx, building.id, 'maintenance.overdue', {
          tasks: (rows as { title: string; due_date: string }[]).map((t) => ({ title: t.title, dueDate: t.due_date })),
        });
      }
      return { flagged: rows.length };
    });
    out[building.name] = r.result?.flagged ?? 0;
  }
  return out;
}

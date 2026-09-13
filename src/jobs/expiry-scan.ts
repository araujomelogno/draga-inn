import { sql } from 'drizzle-orm';
import { localDate } from '@/shared/dates';
import { enqueue } from '@/modules/notifications/outbox';
import { allBuildings, once, systemContext } from './context';

/** Diario 04:15 UY — RN-18: alerta a 30, 15 y 7 días. */
const WINDOWS = [30, 15, 7];

export async function expiryScan(): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const building of await allBuildings()) {
    const ctx = await systemContext(building.id);
    const today = localDate(new Date(), ctx.buildingTimezone);

    const r = await once(ctx, 'expiry-scan', `${building.id}:${today}`, async (tx) => {
      const { rows } = await tx.execute(sql`
        select kind, entity_id, label, expires_on, days_left
          from v_upcoming_expiries
         where building_id = ${building.id} and days_left = any(${sql.param(WINDOWS)}::int[])
         order by days_left`);

      if (rows.length > 0) {
        await enqueue(tx, building.id, 'expiry.upcoming', {
          items: (rows as { kind: string; label: string; expires_on: string; days_left: number }[]).map((r2) => ({
            kind: r2.kind, label: r2.label, expiresOn: r2.expires_on, daysLeft: r2.days_left,
          })),
        });
      }
      return { found: rows.length };
    });
    out[building.name] = r.result?.found ?? 0;
  }
  return out;
}

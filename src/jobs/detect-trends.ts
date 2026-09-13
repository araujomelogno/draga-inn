import { withRead } from '@/db/tx';
import { omittedItems, poolTrends } from '@/modules/compliance/service';
import { localDate } from '@/shared/dates';
import { enqueue } from '@/modules/notifications/outbox';
import { allBuildings, once, systemContext } from './context';

/**
 * Diario 20:15 UY — RN-47 (tendencia de piscina) y RN-46 (ítems
 * sistemáticamente omitidos). Ambos van al outbox agrupado.
 */
export async function detectTrends(): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {};
  for (const building of await allBuildings()) {
    const ctx = await systemContext(building.id);
    const today = localDate(new Date(), ctx.buildingTimezone);

    const trends = await withRead((db) => poolTrends(db, ctx, 30));
    const omitted = await withRead((db) => omittedItems(db, ctx));

    const r = await once(ctx, 'detect-trends', `${building.id}:${today}`, async (tx) => {
      for (const alert of trends.alerts) {
        await enqueue(tx, building.id, 'pool.trend', {
          param: alert.label, direction: alert.direction, values: alert.values, magnitude: alert.magnitude,
        });
      }
      // RN-46 se revisa a diario pero se notifica una vez por mes.
      if (omitted.items.length > 0 && today.slice(8) === '01') {
        await enqueue(tx, building.id, 'checklist.omitted_item', {
          items: (omitted.items as { label: string; miss_pct: string }[]).map((i) => ({ label: i.label, missPct: Number(i.miss_pct) })),
        });
      }
      return { trends: trends.alerts.length, omitted: omitted.items.length };
    });
    out[building.name] = r.result ?? 'ya computado';
  }
  return out;
}

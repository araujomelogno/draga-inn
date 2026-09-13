import { generateDraft } from '@/modules/reports/service';
import { addMonths, localDate, startOfMonth } from '@/shared/dates';
import { enqueue } from '@/modules/notifications/outbox';
import { allBuildings, once, systemContext } from './context';

/**
 * Día 1, 05:00 UY — arma el informe del mes anterior con todos los agregados,
 * incluido el resumen de control de RN-50, y lo deja en `draft`.
 * CB-10: se genera igual aunque el mes no tenga actividad.
 */
export async function generateMonthlyReport(period?: string): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {};
  for (const building of await allBuildings()) {
    const ctx = await systemContext(building.id);
    const today = localDate(new Date(), ctx.buildingTimezone);
    const target = period ?? startOfMonth(addMonths(today, -1));

    const r = await once(ctx, 'generate-monthly-report', `${building.id}:${target}`, async (tx) => {
      const report = await generateDraft(tx, ctx, target);
      await enqueue(tx, building.id, 'report.monthly_ready', { period: target, version: report.version });
      await enqueue(tx, building.id, 'report.owners_digest', {
        period: target,
        openTickets: report.content.tickets.open,
        closedTickets: report.content.tickets.closed,
        audience: 'owners',
      });
      return { period: target, version: report.version, emptyBlocks: report.content.emptyBlocks };
    });
    out[building.name] = r.result ?? 'ya generado';
  }
  return out;
}

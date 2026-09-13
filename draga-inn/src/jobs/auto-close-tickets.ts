import { sql } from 'drizzle-orm';
import { localDate } from '@/shared/dates';
import { appendEvent } from '@/modules/cases/repo';
import { allBuildings, once, systemContext } from './context';

/**
 * RN-11 — Un ticket `resolved` se cierra automáticamente a los 7 días sin
 * objeción. La ventana es configuración del edificio, no una constante.
 */
export async function autoCloseTickets(): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const building of await allBuildings()) {
    const ctx = await systemContext(building.id);
    const today = localDate(new Date(), ctx.buildingTimezone);
    const days = ctx.buildingSettings.ticketAutoCloseDays ?? 7;

    const r = await once(ctx, 'auto-close-tickets', `${building.id}:${today}`, async (tx) => {
      const { rows } = await tx.execute(sql`
        update tickets
           set status = 'closed', closed_at = now(),
               close_reason = ${`Cierre automático a los ${days} días sin objeción (RN-11).`}
         where building_id = ${building.id} and status = 'resolved'
           and resolved_at < now() - (${days} || ' days')::interval
        returning id, case_id, number`);

      for (const t of rows as { id: string; case_id: string; number: number }[]) {
        await appendEvent(tx, ctx, {
          caseId: t.case_id, eventType: 'ticket_status_changed', entityType: 'ticket', entityId: t.id,
          note: `Cierre automático a los ${days} días sin objeción.`,
          payload: { from: 'resolved', to: 'closed', automatic: true, rule: 'RN-11' },
        });
      }
      return { closed: rows.length };
    });
    out[building.name] = r.result?.closed ?? 0;
  }
  return out;
}

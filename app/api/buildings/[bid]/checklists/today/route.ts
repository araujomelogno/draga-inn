import { route } from '@/api/handler';
import { ok } from '@/api/envelope';
import { withTx } from '@/db/tx';
import { checklistsForDate } from '@/modules/logbook/service';
import { localDate } from '@/shared/dates';

export const dynamic = 'force-dynamic';

/** Materializa las instancias del día si no existen, por eso usa withTx. */
export const GET = route(async (req, ctx) => {
  const date = req.nextUrl.searchParams.get('fecha') ?? localDate(new Date(), ctx.buildingTimezone);
  return ok(await withTx(ctx, (tx) => checklistsForDate(tx, ctx, date)));
});

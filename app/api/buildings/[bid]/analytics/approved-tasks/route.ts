import { route } from '@/api/handler';
import { ok } from '@/api/envelope';
import { withRead } from '@/db/tx';
import { approvedTaskStats } from '@/modules/compliance/service';
import { addDays, localDate } from '@/shared/dates';

export const dynamic = 'force-dynamic';

export const GET = route(async (req, ctx) => {
  const today = localDate(new Date(), ctx.buildingTimezone);
  const from = req.nextUrl.searchParams.get('from') ?? addDays(today, -90);
  const to = req.nextUrl.searchParams.get('to') ?? today;
  return ok(await withRead((db) => approvedTaskStats(db, ctx, from, to)));
});

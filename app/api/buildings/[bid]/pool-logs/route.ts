import { route } from '@/api/handler';
import { created, ok } from '@/api/envelope';
import { withRead, withTx } from '@/db/tx';
import { createPoolLog, poolSeries, recentPoolLogs } from '@/modules/logbook/service';
import { poolLogSchema } from '@/shared/schemas';
import { assertCan } from '@/policy/can';
import { addDays, localDate } from '@/shared/dates';

export const dynamic = 'force-dynamic';

export const GET = route(async (req, ctx) => {
  const sp = req.nextUrl.searchParams;
  const today = localDate(new Date(), ctx.buildingTimezone);
  if (sp.get('serie') === '1') {
    const from = sp.get('desde') ?? addDays(today, -30);
    const to = sp.get('hasta') ?? today;
    return ok(await withRead(async (db) => { assertCan(ctx, 'read', 'logbook'); return poolSeries(db, ctx, from, to); }));
  }
  return ok(await withRead(async (db) => { assertCan(ctx, 'read', 'logbook'); return recentPoolLogs(db, ctx, 3); }));
});

export const POST = route(async (req, ctx) => {
  const input = poolLogSchema.parse(await req.json());
  const r = await withTx(ctx, (tx) => createPoolLog(tx, ctx, input));
  const body = { log: r.log, evaluation: r.evaluation, ticketId: r.ticketId };
  return r.duplicate ? ok(body, { duplicate: true }) : created(body);
});

import { route } from '@/api/handler';
import { created, ok } from '@/api/envelope';
import { withTx } from '@/db/tx';
import { createApprovedTask } from '@/modules/logbook/service';
import { approvedTaskSchema } from '@/shared/schemas';

export const dynamic = 'force-dynamic';

export const POST = route(async (req, ctx) => {
  const input = approvedTaskSchema.parse(await req.json());
  const r = await withTx(ctx, (tx) => createApprovedTask(tx, ctx, input));
  const body = { log: r.log, ticketId: r.ticketId };
  return r.duplicate ? ok(body, { duplicate: true }) : created(body);
});

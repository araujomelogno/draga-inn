import { route } from '@/api/handler';
import { ok } from '@/api/envelope';
import { withRead, withTx } from '@/db/tx';
import { getTicketDetail, updateTicket } from '@/modules/tickets/service';
import { updateTicketSchema } from '@/shared/schemas';

export const dynamic = 'force-dynamic';

export const GET = route(async (_req, ctx, params) => ok(await withRead((db) => getTicketDetail(db, ctx, params.id!))));

export const PATCH = route(async (req, ctx, params) => {
  const input = updateTicketSchema.parse(await req.json());
  return ok(await withTx(ctx, (tx) => updateTicket(tx, ctx, params.id!, input)));
});

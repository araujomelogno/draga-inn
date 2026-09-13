import { route } from '@/api/handler';
import { created, ok } from '@/api/envelope';
import { withRead, withTx } from '@/db/tx';
import { addComment, listComments } from '@/modules/tickets/service';
import { ticketCommentSchema } from '@/shared/schemas';

export const dynamic = 'force-dynamic';

export const GET = route(async (_req, ctx, params) => ok(await withRead((db) => listComments(db, ctx, params.id!))));

export const POST = route(async (req, ctx, params) => {
  const input = ticketCommentSchema.parse(await req.json());
  return created(await withTx(ctx, (tx) => addComment(tx, ctx, params.id!, input)));
});

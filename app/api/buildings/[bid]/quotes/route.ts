import { route } from '@/api/handler';
import { created } from '@/api/envelope';
import { withTx } from '@/db/tx';
import { createQuote } from '@/modules/procurement/service';
import { quoteSchema } from '@/shared/schemas';

export const dynamic = 'force-dynamic';

export const POST = route(async (req, ctx) => {
  const input = quoteSchema.parse(await req.json());
  return created(await withTx(ctx, (tx) => createQuote(tx, ctx, input)));
});

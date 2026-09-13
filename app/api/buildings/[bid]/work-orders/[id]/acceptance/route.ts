import { route } from '@/api/handler';
import { ok } from '@/api/envelope';
import { withTx } from '@/db/tx';
import { acceptWorkOrder } from '@/modules/procurement/service';
import { acceptanceSchema } from '@/shared/schemas';

export const dynamic = 'force-dynamic';

export const POST = route(async (req, ctx, params) => {
  const input = acceptanceSchema.parse(await req.json());
  return ok(await withTx(ctx, (tx) => acceptWorkOrder(tx, ctx, params.id!, input)));
});

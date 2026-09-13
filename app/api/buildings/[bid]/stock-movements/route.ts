import { route } from '@/api/handler';
import { created, ok } from '@/api/envelope';
import { withTx } from '@/db/tx';
import { createStockMovement } from '@/modules/logbook/service';
import { stockMovementSchema } from '@/shared/schemas';

export const dynamic = 'force-dynamic';

export const POST = route(async (req, ctx) => {
  const input = stockMovementSchema.parse(await req.json());
  const r = await withTx(ctx, (tx) => createStockMovement(tx, ctx, input));
  const body = { movement: r.movement, item: r.item };
  return r.duplicate ? ok(body, { duplicate: true }) : created(body);
});

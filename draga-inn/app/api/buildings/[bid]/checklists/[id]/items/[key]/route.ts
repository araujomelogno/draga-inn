import { route } from '@/api/handler';
import { ok } from '@/api/envelope';
import { withTx } from '@/db/tx';
import { markChecklistItem } from '@/modules/logbook/service';
import { checklistItemSchema } from '@/shared/schemas';

export const dynamic = 'force-dynamic';

export const POST = route(async (req, ctx, params) => {
  const input = checklistItemSchema.parse(await req.json());
  return ok(await withTx(ctx, (tx) => markChecklistItem(tx, ctx, params.id!, decodeURIComponent(params.key!), input)));
});

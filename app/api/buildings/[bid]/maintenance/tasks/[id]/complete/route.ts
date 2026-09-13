import { z } from 'zod';
import { route } from '@/api/handler';
import { ok } from '@/api/envelope';
import { withTx } from '@/db/tx';
import { completeTask, skipTask } from '@/modules/maintenance/service';
import { money, uuid, currency } from '@/shared/schemas';

export const dynamic = 'force-dynamic';

const schema = z.object({
  notes: z.string().trim().max(2000).nullish(),
  costAmount: money.nullish(),
  currency: currency.nullish(),
  budgetCategoryId: uuid.nullish(),
  clientUuid: uuid.optional(),
  /** `pending → skipped` exige motivo (§3.4). */
  skipReason: z.string().trim().min(3).max(500).optional(),
});

export const POST = route(async (req, ctx, params) => {
  const input = schema.parse(await req.json().catch(() => ({})));
  if (input.skipReason) return ok(await withTx(ctx, (tx) => skipTask(tx, ctx, params.id!, input.skipReason!)));
  return ok(await withTx(ctx, (tx) => completeTask(tx, ctx, params.id!, input)));
});

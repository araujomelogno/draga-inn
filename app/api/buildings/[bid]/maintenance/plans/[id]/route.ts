import { z } from 'zod';
import { route } from '@/api/handler';
import { ok } from '@/api/envelope';
import { withTx } from '@/db/tx';
import { deactivatePlan } from '@/modules/maintenance/service';

export const dynamic = 'force-dynamic';

const schema = z.object({ pendingAction: z.enum(['cancel', 'keep']).optional() });

/** RN-28: no se desactiva sin resolver las tareas pendientes. */
export const DELETE = route(async (req, ctx, params) => {
  const input = schema.parse(await req.json().catch(() => ({})));
  return ok(await withTx(ctx, (tx) => deactivatePlan(tx, ctx, params.id!, input.pendingAction)));
});

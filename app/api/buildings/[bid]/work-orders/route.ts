import { route } from '@/api/handler';
import { created } from '@/api/envelope';
import { withTx } from '@/db/tx';
import { issueWorkOrder } from '@/modules/procurement/service';
import { workOrderSchema } from '@/shared/schemas';

export const dynamic = 'force-dynamic';

/** RN-20: se valida acá. Sin los requisitos, GOVERNANCE_RULE_UNMET con el detalle. */
export const POST = route(async (req, ctx) => {
  const input = workOrderSchema.parse(await req.json());
  const r = await withTx(ctx, (tx) => issueWorkOrder(tx, ctx, input));
  return created(r.workOrder, { withException: r.withException });
});

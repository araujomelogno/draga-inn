import { route } from '@/api/handler';
import { ok } from '@/api/envelope';
import { withTx } from '@/db/tx';
import { deactivateVendor } from '@/modules/procurement/service';

export const dynamic = 'force-dynamic';

/** CB-06: no se elimina, se desactiva. El histórico se conserva. */
export const DELETE = route(async (_req, ctx, params) => ok(await withTx(ctx, (tx) => deactivateVendor(tx, ctx, params.id!))));

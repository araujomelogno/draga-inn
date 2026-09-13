import { route } from '@/api/handler';
import { ok } from '@/api/envelope';
import { withTx } from '@/db/tx';
import { validateInvoice } from '@/modules/procurement/service';

export const dynamic = 'force-dynamic';

/** RN-16: por encima del aprobado + tolerancia, exige nueva aprobación. */
export const POST = route(async (_req, ctx, params) => ok(await withTx(ctx, (tx) => validateInvoice(tx, ctx, params.id!))));

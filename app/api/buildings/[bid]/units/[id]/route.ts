import { route } from '@/api/handler';
import { created, ok } from '@/api/envelope';
import { withRead, withTx } from '@/db/tx';
import { changeOwnership, unitDetail } from '@/modules/units/service';
import { occupancySchema } from '@/shared/schemas';

export const dynamic = 'force-dynamic';

export const GET = route(async (req, ctx, params) =>
  ok(await withRead((db) => unitDetail(db, ctx, params.id!, req.nextUrl.searchParams.get('aFecha') ?? undefined))),
);

/** RN-03: cambio de titularidad — cierra el período anterior y abre uno nuevo. */
export const POST = route(async (req, ctx, params) => {
  const input = occupancySchema.parse({ ...(await req.json()), unitId: params.id });
  return created(await withTx(ctx, (tx) => changeOwnership(tx, ctx, input)));
});

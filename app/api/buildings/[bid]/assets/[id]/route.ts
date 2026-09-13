import { route } from '@/api/handler';
import { ok } from '@/api/envelope';
import { withRead } from '@/db/tx';
import { assetDetail } from '@/modules/maintenance/service';

export const dynamic = 'force-dynamic';
export const GET = route(async (_req, ctx, params) => ok(await withRead((db) => assetDetail(db, ctx, params.id!))));

import { route } from '@/api/handler';
import { ok } from '@/api/envelope';
import { withRead } from '@/db/tx';
import { listParties } from '@/modules/units/service';

export const dynamic = 'force-dynamic';
export const GET = route(async (_req, ctx) => ok(await withRead((db) => listParties(db, ctx))));

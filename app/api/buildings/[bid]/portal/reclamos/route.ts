import { route } from '@/api/handler';
import { ok } from '@/api/envelope';
import { withRead } from '@/db/tx';
import { myTickets } from '@/modules/units/service';

export const dynamic = 'force-dynamic';

/** Solo los reclamos del usuario y de su unidad vigente. Nada más. */
export const GET = route(async (_req, ctx) => ok(await withRead((db) => myTickets(db, ctx))));

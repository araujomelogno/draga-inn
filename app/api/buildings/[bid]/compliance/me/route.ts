import { route } from '@/api/handler';
import { ok } from '@/api/envelope';
import { withRead } from '@/db/tx';
import { myCompliance } from '@/modules/compliance/service';

export const dynamic = 'force-dynamic';

/** RN-49: el encargado accede sin permiso de nadie y con el mismo detalle. */
export const GET = route(async (_req, ctx) => ok(await withRead((db) => myCompliance(db, ctx))));

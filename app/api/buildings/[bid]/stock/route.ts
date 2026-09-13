import { route } from '@/api/handler';
import { ok } from '@/api/envelope';
import { withRead } from '@/db/tx';
import { listStock } from '@/modules/logbook/service';

export const dynamic = 'force-dynamic';
export const GET = route(async (_req, ctx) => ok(await withRead((db) => listStock(db, ctx))));

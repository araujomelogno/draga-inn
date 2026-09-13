import { route } from '@/api/handler';
import { ok } from '@/api/envelope';
import { withRead } from '@/db/tx';
import { downloadUrl } from '@/modules/documents/service';

export const dynamic = 'force-dynamic';

/** Signed URL de lectura de 5 minutos, emitida tras verificar el permiso. */
export const GET = route(async (_req, ctx, params) => ok(await withRead((db) => downloadUrl(db, ctx, params.id!))));

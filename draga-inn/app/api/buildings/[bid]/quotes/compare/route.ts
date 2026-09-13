import { route } from '@/api/handler';
import { ok } from '@/api/envelope';
import { withRead } from '@/db/tx';
import { compareQuotes } from '@/modules/procurement/service';
import { ValidationError } from '@/shared/errors';

export const dynamic = 'force-dynamic';

/** RN-29: marca el más bajo, no recomienda. */
export const GET = route(async (req, ctx) => {
  const caseId = req.nextUrl.searchParams.get('expediente');
  if (!caseId) throw new ValidationError('Indicá el expediente cuyos presupuestos querés comparar.');
  return ok(await withRead((db) => compareQuotes(db, ctx, caseId)));
});

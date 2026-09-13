import { route } from '@/api/handler';
import { ok } from '@/api/envelope';
import { withTx } from '@/db/tx';
import { newVersion, submitReport } from '@/modules/reports/service';
import { monthlyReportSubmitSchema } from '@/shared/schemas';
import { ValidationError } from '@/shared/errors';

export const dynamic = 'force-dynamic';

function normalize(period: string): string {
  if (/^\d{4}-\d{2}$/.test(period)) return `${period}-01`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(period)) return period;
  throw new ValidationError('Indicá el período como aaaa-mm.');
}

/** RN-41: habilitado desde el día 1 del mes siguiente. */
export const POST = route(async (req, ctx, params) => {
  const input = monthlyReportSubmitSchema.parse(await req.json().catch(() => ({})));
  return ok(await withTx(ctx, (tx) => submitReport(tx, ctx, normalize(params.period!), input)));
});

/** RN-42: una corrección genera una versión nueva que referencia la anterior. */
export const PUT = route(async (_req, ctx, params) =>
  ok(await withTx(ctx, (tx) => newVersion(tx, ctx, normalize(params.period!)))),
);

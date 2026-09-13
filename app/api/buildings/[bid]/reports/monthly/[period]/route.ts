import { route } from '@/api/handler';
import { ok } from '@/api/envelope';
import { withRead, withTx } from '@/db/tx';
import { preview, saveNarrative } from '@/modules/reports/service';
import { monthlyReportSubmitSchema } from '@/shared/schemas';
import { ValidationError } from '@/shared/errors';

export const dynamic = 'force-dynamic';

function normalize(period: string): string {
  if (/^\d{4}-\d{2}$/.test(period)) return `${period}-01`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(period)) return period;
  throw new ValidationError('Indicá el período como aaaa-mm.');
}

export const GET = route(async (_req, ctx, params) =>
  ok(await withRead((db) => preview(db, ctx, normalize(params.period!)))),
);

/** Bloque editable de narrativa + justificación del resumen de control (RN-50). */
export const PATCH = route(async (req, ctx, params) => {
  const input = monthlyReportSubmitSchema.parse(await req.json());
  return ok(
    await withTx(ctx, (tx) =>
      saveNarrative(tx, ctx, normalize(params.period!), input.narrative ?? null, input.controlJustification ?? null),
    ),
  );
});

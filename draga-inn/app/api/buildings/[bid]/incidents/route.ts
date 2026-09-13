import { route } from '@/api/handler';
import { created, ok } from '@/api/envelope';
import { withTx } from '@/db/tx';
import { createIncident } from '@/modules/logbook/service';
import { incidentSchema } from '@/shared/schemas';

export const dynamic = 'force-dynamic';

export const POST = route(async (req, ctx) => {
  const input = incidentSchema.parse(await req.json());
  const r = await withTx(ctx, (tx) => createIncident(tx, ctx, input));
  return r.duplicate ? ok(r.incident, { duplicate: true }) : created(r.incident);
});

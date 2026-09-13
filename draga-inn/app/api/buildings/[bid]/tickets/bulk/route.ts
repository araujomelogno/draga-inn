import { z } from 'zod';
import { route } from '@/api/handler';
import { ok } from '@/api/envelope';
import { withTx } from '@/db/tx';
import { bulkUpdate } from '@/modules/tickets/service';
import { uuid, ticketPriority } from '@/shared/schemas';

export const dynamic = 'force-dynamic';

/** RN-13: sin cambio masivo de estado. Solo asignar y priorizar. */
const schema = z.object({
  ticketIds: z.array(uuid).min(1).max(200),
  assignedToUserId: uuid.nullish(),
  priority: ticketPriority.optional(),
}).refine((v) => v.assignedToUserId !== undefined || v.priority !== undefined, {
  message: 'Elegí qué querés cambiar: responsable o prioridad.',
});

export const PATCH = route(async (req, ctx) => {
  const input = schema.parse(await req.json());
  const count = await withTx(ctx, (tx) =>
    bulkUpdate(tx, ctx, input.ticketIds, {
      ...(input.assignedToUserId !== undefined ? { assignedToUserId: input.assignedToUserId } : {}),
      ...(input.priority ? { priority: input.priority } : {}),
    }),
  );
  return ok({ updated: count });
});

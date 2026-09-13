import { z } from 'zod';
import { desc, eq } from 'drizzle-orm';
import { route } from '@/api/handler';
import { created, ok } from '@/api/envelope';
import { withRead, withTx } from '@/db/tx';
import { decisions } from '@/db/schema';
import { appendEvent } from '@/modules/cases/repo';
import { assertCan } from '@/policy/can';
import { isoDate, uuid } from '@/shared/schemas';

export const dynamic = 'force-dynamic';

const schema = z.object({
  title: z.string().trim().min(5).max(200),
  body: z.string().trim().max(8000).nullish(),
  decidedOn: isoDate,
  decidedBy: z.enum(['comision', 'asamblea', 'administrador']),
  responsibleUserId: uuid.nullish(),
  dueDate: isoDate.nullish(),
  caseId: uuid.nullish(),
  minutesDocumentId: uuid.nullish(),
});

export const GET = route(async (_req, ctx) =>
  ok(
    await withRead((db) => {
      assertCan(ctx, 'read', 'decision');
      return db.select().from(decisions).where(eq(decisions.buildingId, ctx.buildingId)).orderBy(desc(decisions.decidedOn));
    }),
  ),
);

export const POST = route(async (req, ctx) => {
  const input = schema.parse(await req.json());
  return created(
    await withTx(ctx, async (tx) => {
      assertCan(ctx, 'create', 'decision');
      const [row] = await tx.insert(decisions)
        .values({ ...input, buildingId: ctx.buildingId, createdBy: ctx.user.id }).returning();
      if (input.caseId) {
        await appendEvent(tx, ctx, {
          caseId: input.caseId, eventType: 'decision_recorded', entityType: 'decision', entityId: row!.id,
          note: input.title, payload: { decidedBy: input.decidedBy, decidedOn: input.decidedOn },
        });
      }
      return row!;
    }),
  );
});

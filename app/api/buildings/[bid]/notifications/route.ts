import { z } from 'zod';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { route } from '@/api/handler';
import { ok } from '@/api/envelope';
import { withRead, withTx } from '@/db/tx';
import { notifications, users } from '@/db/schema';
import { UNDISABLEABLE } from '@/modules/notifications/templates';
import { ValidationError } from '@/shared/errors';
import { uuid } from '@/shared/schemas';

export const dynamic = 'force-dynamic';

export const GET = route(async (_req, ctx) =>
  ok(
    await withRead((db) =>
      db.select().from(notifications)
        .where(and(eq(notifications.buildingId, ctx.buildingId), eq(notifications.userId, ctx.user.id)))
        .orderBy(desc(notifications.createdAt)).limit(100),
    ),
  ),
);

const schema = z.object({
  markRead: z.array(uuid).optional(),
  /** RN-34: el usuario apaga las no críticas. Las críticas no se pueden apagar. */
  mutedTopics: z.array(z.string()).optional(),
});

export const PATCH = route(async (req, ctx) => {
  const input = schema.parse(await req.json());

  const forbidden = (input.mutedTopics ?? []).filter((t) => (UNDISABLEABLE as string[]).includes(t));
  if (forbidden.length > 0) {
    throw new ValidationError(
      'Los avisos de seguridad (incidentes graves y reclamos críticos) no se pueden desactivar.',
      { topics: forbidden },
    );
  }

  return ok(
    await withTx(ctx, async (tx) => {
      if (input.markRead?.length) {
        await tx.update(notifications).set({ readAt: new Date() })
          .where(and(inArray(notifications.id, input.markRead), eq(notifications.userId, ctx.user.id)));
      }
      if (input.mutedTopics) {
        await tx.update(users).set({ notificationPrefs: input.mutedTopics }).where(eq(users.id, ctx.user.id));
      }
      const [{ unread }] = (await tx.select({ unread: sql<number>`count(*)::int` }).from(notifications)
        .where(and(eq(notifications.userId, ctx.user.id), sql`${notifications.readAt} is null`))) as [{ unread: number }];
      return { unread, mutedTopics: input.mutedTopics ?? null };
    }),
  );
});

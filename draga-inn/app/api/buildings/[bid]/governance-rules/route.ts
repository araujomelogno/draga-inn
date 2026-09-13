import { asc, eq, and } from 'drizzle-orm';
import { route } from '@/api/handler';
import { created, ok } from '@/api/envelope';
import { withRead, withTx } from '@/db/tx';
import { governanceRules } from '@/db/schema';
import { assertCan } from '@/policy/can';
import { governanceRuleSchema } from '@/shared/schemas';

export const dynamic = 'force-dynamic';

export const GET = route(async (_req, ctx) =>
  ok(
    await withRead((db) => {
      assertCan(ctx, 'read', 'governance_rule');
      return db.select().from(governanceRules)
        .where(and(eq(governanceRules.buildingId, ctx.buildingId), eq(governanceRules.active, true)))
        .orderBy(asc(governanceRules.thresholdAmount));
    }),
  ),
);

/** ESPEC §7: configurar reglas de gobernanza es privativo de la comisión. */
export const POST = route(async (req, ctx) => {
  const input = governanceRuleSchema.parse(await req.json());
  return created(
    await withTx(ctx, async (tx) => {
      assertCan(ctx, 'create', 'governance_rule');
      const [row] = await tx.insert(governanceRules)
        .values({ ...input, buildingId: ctx.buildingId, createdBy: ctx.user.id }).returning();
      return row!;
    }),
  );
});

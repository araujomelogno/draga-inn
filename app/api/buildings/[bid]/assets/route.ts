import { and, asc, eq, sql } from 'drizzle-orm';
import { route } from '@/api/handler';
import { ok } from '@/api/envelope';
import { withRead } from '@/db/tx';
import { assets } from '@/db/schema';
import { assertCan } from '@/policy/can';

export const dynamic = 'force-dynamic';

export const GET = route(async (req, ctx) =>
  ok(
    await withRead((db) => {
      assertCan(ctx, 'read', 'asset');
      const onlyCritical = req.nextUrl.searchParams.get('criticos') === '1';
      return db.select().from(assets)
        .where(onlyCritical ? and(eq(assets.buildingId, ctx.buildingId), sql`${assets.criticality} = 'critical'`) : eq(assets.buildingId, ctx.buildingId))
        .orderBy(asc(assets.category), asc(assets.name));
    }),
  ),
);

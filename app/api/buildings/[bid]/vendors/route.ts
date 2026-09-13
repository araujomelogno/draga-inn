import { route } from '@/api/handler';
import { ok } from '@/api/envelope';
import { withRead } from '@/db/tx';
import { assertCan } from '@/policy/can';
import { vendors } from '@/db/schema';
import { and, asc, eq } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

export const GET = route(async (req, ctx) =>
  ok(
    await withRead((db) => {
      assertCan(ctx, 'read', 'vendor');
      const onlyActive = req.nextUrl.searchParams.get('activos') !== '0';
      return db.select().from(vendors)
        .where(onlyActive ? and(eq(vendors.buildingId, ctx.buildingId), eq(vendors.status, 'active')) : eq(vendors.buildingId, ctx.buildingId))
        .orderBy(asc(vendors.legalName));
    }),
  ),
);

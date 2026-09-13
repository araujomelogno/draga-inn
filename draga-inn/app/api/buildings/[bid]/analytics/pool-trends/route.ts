import { route } from '@/api/handler';
import { ok } from '@/api/envelope';
import { withRead } from '@/db/tx';
import { poolTrends } from '@/modules/compliance/service';

export const dynamic = 'force-dynamic';

export const GET = route(async (req, ctx) =>
  ok(await withRead((db) => poolTrends(db, ctx, Number(req.nextUrl.searchParams.get('days') ?? 30)))),
);

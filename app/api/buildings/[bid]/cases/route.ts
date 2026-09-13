import { route } from '@/api/handler';
import { ok } from '@/api/envelope';
import { withRead } from '@/db/tx';
import { listCases } from '@/modules/cases/repo';
import { assertCan } from '@/policy/can';
import { pagination } from '@/shared/schemas';
import type { CaseStatus } from '@/policy/transitions';

export const dynamic = 'force-dynamic';

export const GET = route(async (req, ctx) => {
  const sp = req.nextUrl.searchParams;
  const { page, pageSize } = pagination.parse({ page: sp.get('page') ?? 1, pageSize: sp.get('pageSize') ?? 50 });
  return ok(
    await withRead((db) => {
      assertCan(ctx, 'read', 'case');
      return listCases(db, ctx, { status: sp.getAll('estado') as CaseStatus[], limit: pageSize, offset: (page - 1) * pageSize });
    }),
    { page, pageSize },
  );
});

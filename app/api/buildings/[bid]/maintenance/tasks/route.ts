import { route } from '@/api/handler';
import { ok } from '@/api/envelope';
import { withRead } from '@/db/tx';
import { listTasks } from '@/modules/maintenance/service';
import { pagination } from '@/shared/schemas';

export const dynamic = 'force-dynamic';

export const GET = route(async (req, ctx) => {
  const sp = req.nextUrl.searchParams;
  const { page, pageSize } = pagination.parse({ page: sp.get('page') ?? 1, pageSize: sp.get('pageSize') ?? 50 });
  return ok(
    await withRead((db) =>
      listTasks(db, ctx, {
        dueBefore: sp.get('venceAntesDe') ?? undefined,
        from: sp.get('desde') ?? undefined,
        to: sp.get('hasta') ?? undefined,
        status: sp.getAll('estado'),
        assigneeId: sp.get('responsable') ?? undefined,
        limit: pageSize,
        offset: (page - 1) * pageSize,
      }),
    ),
    { page, pageSize },
  );
});

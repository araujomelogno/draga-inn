import { route } from '@/api/handler';
import { ok } from '@/api/envelope';
import { withRead } from '@/db/tx';
import { complianceOverview, type Period } from '@/modules/compliance/service';

export const dynamic = 'force-dynamic';

export const GET = route(async (req, ctx) => {
  const sp = req.nextUrl.searchParams;
  const period = (sp.get('period') ?? 'month') as Period;
  return ok(
    await withRead((db) =>
      complianceOverview(db, ctx, {
        period,
        from: sp.get('from') ?? undefined,
        to: sp.get('to') ?? undefined,
        calendarDays: sp.get('dias') ? Number(sp.get('dias')) : 90,
      }),
    ),
  );
});

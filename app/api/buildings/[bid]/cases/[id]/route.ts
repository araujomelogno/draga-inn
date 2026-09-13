import { z } from 'zod';
import { route } from '@/api/handler';
import { ok } from '@/api/envelope';
import { withRead, withTx } from '@/db/tx';
import { caseTimeline, changeCaseStatus, closureBlockers, getCase } from '@/modules/cases/repo';
import { assertCan } from '@/policy/can';
import { sql } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

/** ESPEC §5.4 — Encabezado que responde el principio rector + línea de tiempo. */
export const GET = route(async (_req, ctx, params) =>
  ok(
    await withRead(async (db) => {
      assertCan(ctx, 'read', 'case');
      const kase = await getCase(db, ctx, params.id!);
      const timeline = await caseTimeline(db, ctx, params.id!);
      const blockers = await closureBlockers(db, ctx, params.id!);

      const { rows: spend } = await db.execute(sql`
        select coalesce(sum(amount), 0)::numeric(14,2) as total, currency from (
          select amount, currency from invoices  where case_id = ${params.id} and status in ('validated','paid')
          union all
          select cost_amount, currency from approved_task_logs where case_id = ${params.id} and cost_amount is not null
        ) s group by currency`);

      const { rows: authorizations } = await db.execute(sql`
        select a.id, a.decision, a.approver_role, a.approved_amount, a.currency,
               a.decided_at, a.rationale, a.is_exception, a.exception_reason, u.display_name as approver_name
          from approvals a left join users u on u.id = a.approver_user_id
         where a.case_id = ${params.id} order by a.decided_at`);

      return {
        case: kase,
        timeline,
        spend,
        authorizations,
        // RN-01: qué falta para poder cerrar.
        closureBlockers: blockers,
        canClose: blockers.tickets === 0 && blockers.workOrders === 0 && blockers.approvals === 0,
      };
    }),
  ),
);

const patchSchema = z.object({
  status: z.enum(['open', 'in_progress', 'waiting', 'resolved', 'closed', 'cancelled']),
  note: z.string().trim().max(1000).optional(),
});

export const PATCH = route(async (req, ctx, params) => {
  const input = patchSchema.parse(await req.json());
  await withTx(ctx, async (tx) => {
    assertCan(ctx, 'update', 'case');
    await changeCaseStatus(tx, ctx, params.id!, input.status, input.note);
  });
  return ok({ id: params.id, status: input.status });
});

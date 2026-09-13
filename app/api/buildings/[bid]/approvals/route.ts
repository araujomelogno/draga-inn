import { route } from '@/api/handler';
import { created, ok } from '@/api/envelope';
import { withRead, withTx } from '@/db/tx';
import { recordApproval } from '@/modules/procurement/service';
import { approvalSchema } from '@/shared/schemas';
import { assertCan } from '@/policy/can';
import { sql } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

export const GET = route(async (req, ctx) =>
  ok(
    await withRead(async (db) => {
      assertCan(ctx, 'read', 'approval_below');
      const onlyExceptions = req.nextUrl.searchParams.get('excepciones') === '1';
      const { rows } = await db.execute(sql`
        select a.id, a.case_id, c.number as case_number, c.title as case_title,
               a.subject_type, a.subject_id, a.decision, a.approved_amount, a.currency,
               a.approver_role, a.decided_at, a.rationale, a.is_exception, a.exception_reason,
               u.display_name as approver_name, g.name as rule_name
          from approvals a
          join cases c on c.id = a.case_id
          left join users u on u.id = a.approver_user_id
          left join governance_rules g on g.id = a.rule_id
         where a.building_id = ${ctx.buildingId}
           ${onlyExceptions ? sql`and a.is_exception` : sql``}
         order by a.decided_at desc limit 200`);
      return rows;
    }),
  ),
);

export const POST = route(async (req, ctx) => {
  const input = approvalSchema.parse(await req.json());
  return created(await withTx(ctx, (tx) => recordApproval(tx, ctx, input)));
});

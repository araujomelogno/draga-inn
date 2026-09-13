import { route } from '@/api/handler';
import { created, ok } from '@/api/envelope';
import { withRead, withTx } from '@/db/tx';
import { createInvoice } from '@/modules/procurement/service';
import { invoiceSchema, pagination } from '@/shared/schemas';
import { assertCan } from '@/policy/can';
import { sql } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

export const GET = route(async (req, ctx) => {
  const sp = req.nextUrl.searchParams;
  const { page, pageSize } = pagination.parse({ page: sp.get('page') ?? 1, pageSize: sp.get('pageSize') ?? 25 });
  const status = sp.get('estado');
  return ok(
    await withRead(async (db) => {
      assertCan(ctx, 'read', 'invoice');
      const { rows } = await db.execute(sql`
        select i.id, i.number, i.issue_date, i.amount, i.currency, i.status,
               v.legal_name as vendor_name, bc.name as category, w.number as work_order_number
          from invoices i
          join vendors v on v.id = i.vendor_id
          left join budget_categories bc on bc.id = i.budget_category_id
          left join work_orders w on w.id = i.work_order_id
         where i.building_id = ${ctx.buildingId}
           ${status ? sql`and i.status::text = ${status}` : sql``}
         order by i.issue_date desc limit ${pageSize} offset ${(page - 1) * pageSize}`);
      return rows;
    }),
    { page, pageSize },
  );
});

export const POST = route(async (req, ctx) => {
  const input = invoiceSchema.parse(await req.json());
  return created(await withTx(ctx, (tx) => createInvoice(tx, ctx, input)));
});

import { sql } from 'drizzle-orm';
import { route } from '@/api/handler';
import { withRead } from '@/db/tx';
import { assertCan } from '@/policy/can';
import { localDate, startOfMonth } from '@/shared/dates';

export const dynamic = 'force-dynamic';

/** ESPEC §7 "Exportar contable": administrador, comisión y contador. */
export const GET = route(async (req, ctx) => {
  assertCan(ctx, 'export', 'accounting_export');
  const today = localDate(new Date(), ctx.buildingTimezone);
  const from = req.nextUrl.searchParams.get('from') ?? startOfMonth(today);
  const to = req.nextUrl.searchParams.get('to') ?? today;

  const rows = await withRead(async (db) => {
    const { rows: r } = await db.execute(sql`
      select 'factura' as tipo, i.issue_date as fecha, i.number as comprobante,
             v.legal_name as proveedor, v.tax_id as rut, coalesce(bc.name,'Sin rubro') as rubro,
             i.amount as monto, i.currency as moneda, i.status::text as estado,
             c.number as expediente
        from invoices i
        join vendors v on v.id = i.vendor_id
        left join budget_categories bc on bc.id = i.budget_category_id
        left join cases c on c.id = i.case_id
       where i.building_id = ${ctx.buildingId} and i.issue_date between ${from}::date and ${to}::date
      union all
      select 'tarea_aprobada', a.performed_on, null, null, null, coalesce(bc.name,'Sin rubro'),
             a.cost_amount, a.currency, a.status, c.number
        from approved_task_logs a
        left join budget_categories bc on bc.id = a.budget_category_id
        left join cases c on c.id = a.case_id
       where a.building_id = ${ctx.buildingId} and a.cost_amount is not null
         and a.performed_on between ${from}::date and ${to}::date
      order by fecha`);
    return r as Record<string, string | number | null>[];
  });

  const header = 'tipo,fecha,comprobante,proveedor,rut,rubro,monto,moneda,estado,expediente';
  const csvBody = rows
    .map((r) => ['tipo', 'fecha', 'comprobante', 'proveedor', 'rut', 'rubro', 'monto', 'moneda', 'estado', 'expediente']
      .map((k) => cell(r[k])).join(','))
    .join('\n');

  // BOM para que Excel en Windows abra bien los acentos.
  return new Response(`﻿${header}\n${csvBody}`, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="contable-${from}-a-${to}.csv"`,
    },
  }) as never;
});

function cell(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

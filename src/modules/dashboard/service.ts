import { sql } from 'drizzle-orm';
import type { Tx } from '@/db/tx';
import type { AuthContext } from '@/auth/context';
import { assertCan } from '@/policy/can';
import { localDate } from '@/shared/dates';
import { currentSeason } from '@/shared/season';
import { COMPLIANCE_FRAMING, complianceOverview, omittedItems, poolTrends } from '@/modules/compliance/service';

/**
 * ESPEC §5.1 — Tablero. Cada indicador es clickeable y navega al listado
 * filtrado, así que cada uno viaja con su `href`.
 * RN-27: "sin asignar" y "vencidos" en rojo solo si son > 0.
 */
export type Indicator = { key: string; label: string; value: number | string; href: string; tone: 'neutral' | 'warning' | 'danger' };

export async function dashboard(tx: Tx, ctx: AuthContext) {
  assertCan(ctx, 'read', 'building');
  const today = localDate(new Date(), ctx.buildingTimezone);

  const { rows } = await tx.execute(sql`
    select
      (select count(*) from tickets where building_id = ${ctx.buildingId} and status <> 'closed')::int as open_tickets,
      (select count(*) from tickets where building_id = ${ctx.buildingId} and status <> 'closed' and priority = 'critical')::int as critical_tickets,
      (select count(*) from tickets where building_id = ${ctx.buildingId} and status <> 'closed'
         and due_date is not null and due_date < current_date)::int as overdue_tickets,
      (select count(*) from tickets where building_id = ${ctx.buildingId} and status not in ('closed','resolved')
         and assigned_to_user_id is null)::int as unassigned_tickets,
      (select count(*) from maintenance_tasks where building_id = ${ctx.buildingId}
         and status in ('pending','overdue') and due_date < current_date)::int as overdue_tasks,
      (select count(*) from quotes q where q.building_id = ${ctx.buildingId} and q.status = 'submitted'
         and not exists (select 1 from approvals a where a.subject_type = 'quote' and a.subject_id = q.id))::int as pending_approvals,
      (select count(*) from decisions where building_id = ${ctx.buildingId} and status in ('pending','in_progress'))::int as pending_decisions,
      (select count(*) from approvals where building_id = ${ctx.buildingId} and is_exception
         and decided_at >= date_trunc('month', current_date))::int as month_exceptions,
      (select count(*) from v_upcoming_expiries where building_id = ${ctx.buildingId}
         and days_left between 0 and 30)::int as expiring_30d,
      (select count(*) from assets a where a.building_id = ${ctx.buildingId} and a.criticality = 'critical'
         and exists (select 1 from maintenance_tasks mt where mt.asset_id = a.id
                       and mt.status in ('pending','overdue') and mt.due_date < current_date))::int as critical_assets_overdue,
      (select count(*) from vendors where building_id = ${ctx.buildingId} and status = 'active'
         and contract_until is not null and contract_until <= current_date + 30)::int as expiring_contracts,
      (select count(*) from work_orders where building_id = ${ctx.buildingId} and status in ('issued','in_progress','completed'))::int as open_work_orders,
      (select count(*) from invoices where building_id = ${ctx.buildingId} and status = 'received')::int as unvalidated_invoices,
      (select count(*) from checklist_instances where building_id = ${ctx.buildingId}
         and period_date < current_date and status <> 'complete')::int as pending_checklists,
      (select count(*) from stock_items where building_id = ${ctx.buildingId}
         and current_quantity < min_quantity)::int as low_stock,
      (select count(*) from units u where u.building_id = ${ctx.buildingId} and u.unit_type = 'apartment'
         and not exists (select 1 from unit_occupancies uo where uo.unit_id = u.id
                           and uo.role = 'owner' and uo.is_primary and current_date <@ uo.period))::int as units_without_owner
  `);
  const k = rows[0] as Record<string, number>;

  // Secuencial: todas comparten el mismo cliente del pool (ver nota en compliance/service).
  const compliance = await complianceOverview(tx, ctx, { period: 'month', calendarDays: 30 });
  const omitted = await omittedItems(tx, ctx);
  const trends = await poolTrends(tx, ctx, 30);

  const { rows: spendRows } = await tx.execute(sql`
    select coalesce(bc.name, 'Sin rubro') as category, v.currency,
           sum(v.total)::numeric(14,2) as total
      from v_monthly_spend v
      left join budget_categories bc on bc.id = v.budget_category_id
     where v.building_id = ${ctx.buildingId} and v.period = date_trunc('month', current_date)::date
     group by bc.name, v.currency order by total desc
  `);

  const danger = (n: number) => (n > 0 ? ('danger' as const) : ('neutral' as const));
  const warn = (n: number) => (n > 0 ? ('warning' as const) : ('neutral' as const));

  return {
    today,
    season: currentSeason(ctx.buildingSettings, ctx.buildingTimezone),
    blocks: [
      {
        key: 'operacion', title: 'Operación',
        indicators: [
          { key: 'open_tickets', label: 'Tickets abiertos', value: k.open_tickets!, href: '/admin/tickets?estado=abiertos', tone: 'neutral' },
          { key: 'critical_tickets', label: 'Críticos', value: k.critical_tickets!, href: '/admin/tickets?prioridad=critical', tone: danger(k.critical_tickets!) },
          // RN-27
          { key: 'overdue_tickets', label: 'Vencidos', value: k.overdue_tickets!, href: '/admin/tickets?vencidos=1', tone: danger(k.overdue_tickets!) },
          { key: 'unassigned_tickets', label: 'Sin asignar', value: k.unassigned_tickets!, href: '/admin/tickets?sinAsignar=1', tone: danger(k.unassigned_tickets!) },
          { key: 'overdue_tasks', label: 'Tareas de mantenimiento vencidas', value: k.overdue_tasks!, href: '/admin/mantenimiento?estado=overdue', tone: danger(k.overdue_tasks!) },
        ] satisfies Indicator[],
      },
      {
        key: 'gobernanza', title: 'Gobernanza',
        indicators: [
          { key: 'pending_approvals', label: 'Aprobaciones pendientes', value: k.pending_approvals!, href: '/admin/aprobaciones', tone: warn(k.pending_approvals!) },
          { key: 'pending_decisions', label: 'Decisiones sin ejecutar', value: k.pending_decisions!, href: '/admin/decisiones', tone: warn(k.pending_decisions!) },
          // RN-02: las excepciones se muestran, nunca se ocultan.
          { key: 'month_exceptions', label: 'Excepciones del mes', value: k.month_exceptions!, href: '/admin/aprobaciones?excepciones=1', tone: warn(k.month_exceptions!) },
        ] satisfies Indicator[],
      },
      {
        key: 'riesgos', title: 'Riesgos',
        indicators: [
          { key: 'expiring_30d', label: 'Vencen en 30 días', value: k.expiring_30d!, href: '/admin/documentos?vencen=30', tone: warn(k.expiring_30d!) },
          { key: 'critical_assets_overdue', label: 'Activos críticos con preventivo vencido', value: k.critical_assets_overdue!, href: '/admin/activos?criticos=1', tone: danger(k.critical_assets_overdue!) },
          { key: 'units_without_owner', label: 'Unidades sin titular vigente', value: k.units_without_owner!, href: '/admin/unidades?incompletas=1', tone: warn(k.units_without_owner!) },
          { key: 'missing_streak', label: 'Días sin registro', value: compliance.streak.missing, href: '/admin/cumplimiento', tone: compliance.streak.missing >= 7 ? 'danger' : warn(compliance.streak.missing) },
        ] satisfies Indicator[],
      },
      {
        key: 'proveedores', title: 'Proveedores',
        indicators: [
          { key: 'expiring_contracts', label: 'Contratos por vencer', value: k.expiring_contracts!, href: '/admin/proveedores?vencen=30', tone: warn(k.expiring_contracts!) },
          { key: 'open_work_orders', label: 'Trabajos en curso', value: k.open_work_orders!, href: '/admin/ordenes', tone: 'neutral' },
          { key: 'unvalidated_invoices', label: 'Facturas sin validar', value: k.unvalidated_invoices!, href: '/admin/facturas?estado=received', tone: warn(k.unvalidated_invoices!) },
        ] satisfies Indicator[],
      },
      {
        key: 'cumplimiento', title: 'Cumplimiento del plan del edificio',
        // RN-51: el encuadre viaja con el dato.
        framing: COMPLIANCE_FRAMING,
        indicators: [
          { key: 'compliance_pct', label: '% del plan cumplido este mes', value: `${compliance.compliancePct} %`, href: '/admin/cumplimiento', tone: compliance.compliancePct >= 90 ? 'neutral' : compliance.compliancePct >= 70 ? 'warning' : 'danger' },
          { key: 'missing_streak', label: 'Racha de días sin registro', value: compliance.streak.missing, href: '/admin/cumplimiento', tone: warn(compliance.streak.missing) },
          { key: 'pending_checklists', label: 'Planillas pendientes', value: k.pending_checklists!, href: '/admin/planillas', tone: warn(k.pending_checklists!) },
          { key: 'omitted_items', label: 'Ítems sistemáticamente omitidos', value: omitted.items.length, href: '/admin/cumplimiento?tab=omitidos', tone: warn(omitted.items.length) },
          { key: 'pool_trends', label: 'Avisos de tendencia de piscina', value: trends.alerts.length, href: '/admin/cumplimiento?tab=piscina', tone: warn(trends.alerts.length) },
        ] satisfies Indicator[],
        poolSparkline: compliance.calendar.map((d) => ({ date: d.date, poolLogged: d.poolLogged, poolOutOfRange: d.poolOutOfRange })),
      },
      {
        key: 'gasto', title: 'Gasto del mes',
        // Sin saldos ni morosidad: eso es v2.
        indicators: (spendRows as { category: string; currency: string; total: string }[]).map((r) => ({
          key: `spend_${r.category}`, label: r.category, value: r.total, href: '/admin/facturas', tone: 'neutral' as const,
        })),
      },
    ],
    lowStock: k.low_stock!,
  };
}

-- ═══════════════════════════════════════════════════════════════════════════
-- 0002 — Vistas de cumplimiento y análisis operativo (HANDOFF §2.11)
-- ═══════════════════════════════════════════════════════════════════════════

-- Cumplimiento por instancia de checklist, SOLO sobre ítems requeridos (RN-48).
create view v_checklist_compliance as
select ci.building_id,
       ci.id           as instance_id,
       ci.template_id,
       ci.period_date,
       (count(*) filter (where (it.value ->> 'required')::boolean))::int            as required_items,
       (count(*) filter (where (it.value ->> 'required')::boolean and r.done))::int as completed_items,
       round(100.0 * count(*) filter (where (it.value ->> 'required')::boolean and r.done)
             / nullif(count(*) filter (where (it.value ->> 'required')::boolean), 0), 2) as pct
  from checklist_instances ci
  join checklist_templates t on t.id = ci.template_id
 cross join lateral jsonb_array_elements(t.items) it
  left join checklist_item_results r
         on r.instance_id = ci.id and r.item_key = it.value ->> 'key'
 group by ci.building_id, ci.id, ci.template_id, ci.period_date;

-- RN-46: ítems no marcados en ≥ 80 % de las instancias de los últimos 30 días.
create view v_omitted_items as
select ci.building_id,
       ci.template_id,
       r.item_key,
       max(r.label)                                               as label,
       count(*)::int                                              as occurrences,
       (count(*) filter (where not r.done))::int                  as times_missed,
       round(100.0 * count(*) filter (where not r.done) / count(*), 2) as miss_pct
  from checklist_instances ci
  join checklist_item_results r on r.instance_id = ci.id
 where ci.period_date >= current_date - interval '30 days'
   and r.required
 group by ci.building_id, ci.template_id, r.item_key
having count(*) >= 5
   and 100.0 * count(*) filter (where not r.done) / count(*) >= 80;

-- Estadísticas de tareas aprobadas (Anexo B), con tasa de derivación a técnico.
create view v_approved_task_stats as
select building_id,
       date_trunc('month', performed_on)::date            as period,
       trade,
       count(*)::int                                      as total,
       avg(time_spent_minutes)::numeric(10,1)             as avg_minutes,
       sum(coalesce(cost_amount, 0))::numeric(14,2)       as total_cost,
       round(100.0 * count(*) filter (where escalated) / count(*), 2) as escalation_pct
  from approved_task_logs
 group by building_id, date_trunc('month', performed_on), trade;

-- RN-43 / RN-47: serie de piscina con deltas. Los días sin registro NO se interpolan:
-- quedan como huecos en la serie y rompen la secuencia de tendencia.
create view v_pool_series as
select building_id,
       logged_on,
       logged_at,
       free_chlorine, ph, alkalinity, calcium_hardness,
       out_of_range,
       free_chlorine - lag(free_chlorine) over w as d_chlorine,
       ph            - lag(ph)            over w as d_ph,
       alkalinity    - lag(alkalinity)    over w as d_alkalinity,
       logged_on     - lag(logged_on)     over w as days_since_prev
  from pool_logs
window w as (partition by building_id order by logged_on, logged_at);

-- Gasto del mes por rubro (ESPEC §5.1). Sin saldos ni morosidad: eso es v2.
create view v_monthly_spend as
select building_id, period, budget_category_id, currency, sum(amount)::numeric(14,2) as total
  from (
    select building_id, date_trunc('month', issue_date)::date as period,
           budget_category_id, currency, amount
      from invoices where status in ('validated','paid')
    union all
    select building_id, date_trunc('month', performed_on)::date, budget_category_id,
           currency, cost_amount
      from approved_task_logs where cost_amount is not null
    union all
    select building_id, date_trunc('month', completed_at)::date, budget_category_id,
           currency, cost_amount
      from maintenance_tasks where cost_amount is not null and completed_at is not null
  ) s
 group by building_id, period, budget_category_id, currency;

-- Titularidad vigente por unidad (RN-03: se lee del período abierto, no de un campo).
create view v_current_occupancy as
select o.building_id, o.unit_id, o.role, o.party_id, p.full_name, p.email, p.phone, o.period
  from unit_occupancies o
  join parties p on p.id = o.party_id
 where o.is_primary
   and current_date <@ o.period;

-- RN-18: vencimientos que entran al tablero de riesgos a 30/15/7 días.
create view v_upcoming_expiries as
select building_id, 'document'::text as kind, id as entity_id, title as label, expires_on,
       (expires_on - current_date) as days_left
  from documents where expires_on is not null
union all
select building_id, 'asset_warranty', id, name, warranty_until, (warranty_until - current_date)
  from assets where warranty_until is not null and status = 'active'
union all
select building_id, 'vendor_contract', id, legal_name, contract_until, (contract_until - current_date)
  from vendors where contract_until is not null and status = 'active';

-- ═══════════════════════════════════════════════════════════════════════════
-- 0001 — Auditoría en la base de datos (HANDOFF §3)
-- La aplicación declara QUIÉN actúa; la base registra QUÉ cambió.
-- No se puede saltear desde código de aplicación.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function fn_audit() returns trigger language plpgsql as $fn$
declare
  v_actor  uuid := nullif(current_setting('app.user_id', true), '')::uuid;
  v_role   text := nullif(current_setting('app.user_role', true), '');
  v_req    text := nullif(current_setting('app.request_id', true), '');
  v_before jsonb;
  v_after  jsonb;
  v_changed text[];
begin
  if (tg_op = 'DELETE') then
    v_before := to_jsonb(old); v_after := null;
  elsif (tg_op = 'UPDATE') then
    v_before := to_jsonb(old); v_after := to_jsonb(new);
    select array_agg(key order by key) into v_changed
      from jsonb_each(v_after)
     where v_after -> key is distinct from v_before -> key;
    -- `updated_at` sola no es un cambio que valga la pena auditar
    if v_changed is not null then
      v_changed := array_remove(v_changed, 'updated_at');
    end if;
    if v_changed is null or cardinality(v_changed) = 0 then
      return new;
    end if;
  else
    v_before := null; v_after := to_jsonb(new);
  end if;

  insert into audit_log (building_id, actor_user_id, actor_role, entity_type,
                         entity_id, action, before, after, changed_fields, request_id)
  values (
    coalesce((v_after ->> 'building_id')::uuid, (v_before ->> 'building_id')::uuid),
    v_actor, v_role, tg_table_name,
    coalesce((v_after ->> 'id')::uuid, (v_before ->> 'id')::uuid),
    tg_op, v_before, v_after, v_changed, v_req
  );
  return coalesce(new, old);
end $fn$;

-- Aplicación masiva a todas las tablas auditables
do $do$
declare
  t text;
  auditable text[] := array[
    'buildings','sectors','units','common_areas',
    'parties','unit_occupancies','users','memberships','invitations',
    'cases','tickets','ticket_comments',
    'assets','maintenance_plans','maintenance_tasks','asset_events',
    'vendors','budget_categories','quotes','governance_rules','approvals',
    'work_orders','invoices','decisions',
    'checklist_templates','checklist_instances','checklist_item_results',
    'pool_logs','approved_task_logs','incidents','stock_items','stock_movements',
    'staff_notes','monthly_reports','documents','document_links'
  ];
begin
  foreach t in array auditable loop
    execute format(
      'create trigger trg_audit after insert or update or delete on %I
         for each row execute function fn_audit()', t);
  end loop;
end $do$;

-- ─── RN-19: audit_log es inmutable para todos, sin excepción ──────────────
create rule audit_log_no_update as on update to audit_log do instead nothing;
create rule audit_log_no_delete as on delete to audit_log do instead nothing;

-- ─── case_events es append-only: se revoca con un evento compensatorio ────
create or replace function fn_append_only() returns trigger language plpgsql as $fn$
begin
  raise exception
    'La tabla % es append-only: no se actualiza ni se borra. Registrá un hecho nuevo que referencie al anterior.',
    tg_table_name
    using errcode = 'restrict_violation';
end $fn$;

create trigger trg_case_events_append_only
  before update or delete on case_events
  for each row execute function fn_append_only();

-- ─── approvals: una corrección crea una fila nueva con supersedes_id ──────
create trigger trg_approvals_append_only
  before update or delete on approvals
  for each row execute function fn_append_only();

-- ─── RN-42: un informe enviado no se edita ────────────────────────────────
create or replace function fn_monthly_report_immutable() returns trigger language plpgsql as $fn$
begin
  if old.status = 'submitted' then
    raise exception
      'El informe del período % ya fue enviado. Generá una versión nueva que lo referencie (RN-42).',
      to_char(old.period_month, 'MM/YYYY')
      using errcode = 'restrict_violation';
  end if;
  return new;
end $fn$;

create trigger trg_monthly_reports_immutable
  before update on monthly_reports
  for each row execute function fn_monthly_report_immutable();

-- ─── RN-04: el edificio debe tener siempre al menos un administrador activo
create or replace function fn_keep_one_admin() returns trigger language plpgsql as $fn$
declare
  v_building uuid := coalesce(new.building_id, old.building_id);
  v_remaining int;
begin
  select count(*) into v_remaining
    from memberships m
    join users u on u.id = m.user_id
   where m.building_id = v_building
     and m.role = 'administrador'
     and m.is_active
     and u.is_active
     and m.id is distinct from old.id;

  if tg_op = 'UPDATE' and new.role = 'administrador' and new.is_active then
    return new;  -- sigue habiendo uno: el propio registro
  end if;

  if v_remaining = 0 then
    raise exception
      'No podés dejar al edificio sin ningún administrador activo. Designá otro antes de quitar este (RN-04).'
      using errcode = 'restrict_violation';
  end if;
  return coalesce(new, old);
end $fn$;

create trigger trg_memberships_keep_admin
  before update or delete on memberships
  for each row when (old.role = 'administrador' and old.is_active)
  execute function fn_keep_one_admin();

-- ─── updated_at automático ────────────────────────────────────────────────
create or replace function fn_touch_updated_at() returns trigger language plpgsql as $fn$
begin
  new.updated_at := now();
  return new;
end $fn$;

do $do$
declare
  t text;
begin
  for t in
    select c.relname from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      join pg_attribute a on a.attrelid = c.oid and a.attname = 'updated_at'
     where n.nspname = 'public' and c.relkind = 'r'
  loop
    execute format(
      'create trigger trg_touch_updated_at before update on %I
         for each row execute function fn_touch_updated_at()', t);
  end loop;
end $do$;

-- ─── Correlativos por edificio (cases.number, tickets.number, work_orders) ─
create or replace function fn_next_number(p_building uuid, p_entity text)
returns bigint language plpgsql as $fn$
declare
  v_next bigint;
begin
  -- El lock por edificio+entidad serializa la asignación sin bloquear la tabla
  perform pg_advisory_xact_lock(hashtext(p_building::text || ':' || p_entity));
  execute format('select coalesce(max(number), 0) + 1 from %I where building_id = $1', p_entity)
    into v_next using p_building;
  return v_next;
end $fn$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 0000 — Esquema base del Sistema de Gestión y Gobernanza del Edificio Draga Inn
-- Referencia: HANDOFF_TECNICO §2.1–2.11
-- ═══════════════════════════════════════════════════════════════════════════

create extension if not exists "pgcrypto";   -- gen_random_uuid()
create extension if not exists "btree_gist"; -- exclusión de solapamiento en unit_occupancies

-- ─── Enums ────────────────────────────────────────────────────────────────
create type app_role            as enum ('owner','tenant','encargado','administrador','comision','contador','auditor');
create type frequency           as enum ('daily','weekly','monthly','quarterly','biannual','annual','seasonal');
create type sector_kind         as enum ('tower','block','sector');
create type unit_type           as enum ('apartment','parking','storage','commercial','common');
create type party_kind          as enum ('person','company');
create type occupancy_role      as enum ('owner','tenant','occupant');
create type case_status         as enum ('open','in_progress','waiting','resolved','closed','cancelled');
create type ticket_status       as enum ('new','triage','assigned','in_progress','waiting_owner','resolved','closed');
create type ticket_priority     as enum ('low','normal','high','critical');
create type ticket_source       as enum ('portal','pwa','admin','whatsapp','system');
create type criticality         as enum ('low','normal','critical');
create type asset_status        as enum ('active','inactive','decommissioned');
create type task_status         as enum ('pending','done','overdue','skipped');
create type asset_event_type    as enum ('failure','repair','inspection','replacement');
create type vendor_status       as enum ('active','inactive');
create type quote_status        as enum ('submitted','approved','rejected','expired','superseded');
create type approval_decision   as enum ('approved','rejected');
create type approval_subject    as enum ('quote','work_order','invoice','decision');
create type wo_status           as enum ('draft','issued','in_progress','completed','accepted','cancelled');
create type invoice_status      as enum ('received','validated','rejected','paid');
create type decision_status     as enum ('pending','in_progress','done','cancelled');
create type decision_body       as enum ('comision','asamblea','administrador');
create type checklist_status    as enum ('pending','partial','complete');
create type trade               as enum ('masonry','electrical','carpentry','plumbing','painting','other');
create type incident_type       as enum ('service_outage','leak','fire_start','accident','unauthorized_entry','damage','other');
create type stock_movement_kind as enum ('in','out','adjust');
create type staff_note_kind     as enum ('attendance','leave','day_off','replacement','training','sanction');
create type monthly_report_status as enum ('draft','submitted');
create type doc_visibility      as enum ('internal','committee','owners','public');
create type notification_channel as enum ('email','inapp','whatsapp');
create type notification_status  as enum ('pending','sent','failed','suppressed');
create type outbox_status       as enum ('pending','processing','done','failed');
create type day_status          as enum ('complete','partial','missing');

-- ─── §2.1 Tenencia y estructura ───────────────────────────────────────────
create table buildings (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  legal_name text,
  address    text,
  city       text default 'Punta del Este',
  department text default 'Maldonado',
  country    char(2) default 'UY',
  timezone   text not null default 'America/Montevideo',
  currency   char(3) not null default 'UYU',
  settings   jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table sectors (
  id          uuid primary key default gen_random_uuid(),
  building_id uuid not null references buildings(id) on delete cascade,
  name        text not null,
  kind        sector_kind not null default 'tower',
  created_at  timestamptz not null default now()
);

create table units (
  id             uuid primary key default gen_random_uuid(),
  building_id    uuid not null references buildings(id) on delete cascade,
  sector_id      uuid references sectors(id),
  code           text not null,
  unit_type      unit_type not null default 'apartment',
  floor          text,
  coefficient    numeric(7,4),
  area_m2        numeric(10,2),
  parent_unit_id uuid references units(id),
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  created_by     uuid,
  constraint units_building_code_uq unique (building_id, code)
);
create index units_building_idx on units (building_id);

create table common_areas (
  id          uuid primary key default gen_random_uuid(),
  building_id uuid not null references buildings(id) on delete cascade,
  name        text not null,
  kind        text,
  bookable    boolean not null default false,
  created_at  timestamptz not null default now()
);

-- ─── §2.2 Personas, usuarios y roles ──────────────────────────────────────
create table parties (
  id          uuid primary key default gen_random_uuid(),
  building_id uuid not null references buildings(id) on delete cascade,
  kind        party_kind not null default 'person',
  full_name   text not null,
  doc_type    text,
  doc_number  text,
  email       text,
  phone       text,
  country     char(2),
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid
);
create index parties_building_idx on parties (building_id);
create index parties_email_idx    on parties (email);

-- RN-03: la titularidad nunca se sobrescribe; se cierra un período y se abre otro.
create table unit_occupancies (
  id          uuid primary key default gen_random_uuid(),
  building_id uuid not null references buildings(id) on delete cascade,
  unit_id     uuid not null references units(id) on delete cascade,
  party_id    uuid not null references parties(id),
  role        occupancy_role not null,
  period      daterange not null,
  is_primary  boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid,
  constraint unit_occupancies_no_overlap exclude using gist (
    unit_id with =, role with =, period with &&
  ) where (is_primary)
);
create index unit_occupancies_unit_role_idx on unit_occupancies (unit_id, role);

create table users (
  id                 uuid primary key default gen_random_uuid(),
  firebase_uid       text not null unique,
  email              text not null,
  display_name       text,
  party_id           uuid references parties(id),
  is_active          boolean not null default true,
  notification_prefs text[] not null default '{}'::text[],
  last_login_at      timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index users_email_idx on users (email);

create table memberships (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references users(id) on delete cascade,
  building_id uuid not null references buildings(id) on delete cascade,
  role        app_role not null,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid,
  constraint memberships_uq unique (user_id, building_id, role)
);

create table invitations (
  id          uuid primary key default gen_random_uuid(),
  building_id uuid not null references buildings(id) on delete cascade,
  email       text not null,
  role        app_role not null,
  party_id    uuid references parties(id),
  accepted_at timestamptz,
  created_at  timestamptz not null default now(),
  created_by  uuid,
  constraint invitations_uq unique (building_id, email, role)
);

-- ─── §2.3 Expediente (el spine) ───────────────────────────────────────────
create table cases (
  id          uuid primary key default gen_random_uuid(),
  building_id uuid not null references buildings(id) on delete cascade,
  number      bigint not null,
  title       text not null,
  category    text,
  status      case_status not null default 'open',
  unit_id     uuid references units(id),
  asset_id    uuid,
  summary     text,
  opened_by   uuid references users(id),
  opened_at   timestamptz not null default now(),
  closed_at   timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid,
  constraint cases_building_number_uq unique (building_id, number)
);
create index cases_building_status_idx on cases (building_id, status);

create table case_events (
  id            uuid primary key default gen_random_uuid(),
  building_id   uuid not null references buildings(id) on delete cascade,
  case_id       uuid not null references cases(id) on delete cascade,
  event_type    text not null,
  entity_type   text,
  entity_id     uuid,
  actor_user_id uuid references users(id),
  occurred_at   timestamptz not null default now(),
  note          text,
  payload       jsonb not null default '{}'::jsonb
);
create index case_events_case_time_idx on case_events (case_id, occurred_at);

-- ─── §2.4 Tickets ─────────────────────────────────────────────────────────
create table tickets (
  id                  uuid primary key default gen_random_uuid(),
  building_id         uuid not null references buildings(id) on delete cascade,
  case_id             uuid not null references cases(id),
  number              bigint not null,
  unit_id             uuid references units(id) on delete set null,
  common_area_id      uuid references common_areas(id),
  asset_id            uuid,
  title               text not null,
  description         text,
  category            text not null,
  priority            ticket_priority not null default 'normal',
  status              ticket_status not null default 'new',
  reported_by_user_id uuid references users(id),
  assigned_to_user_id uuid references users(id),
  vendor_id           uuid,
  due_date            date,
  resolution_note     text,
  detached_unit_note  text,
  resolved_at         timestamptz,
  closed_at           timestamptz,
  close_reason        text,
  reopened_count      bigint not null default 0,
  source              ticket_source not null default 'admin',
  client_uuid         uuid unique,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  created_by          uuid references users(id),
  constraint tickets_building_number_uq unique (building_id, number)
);
create index tickets_building_status_idx on tickets (building_id, status);
create index tickets_assignee_idx        on tickets (assigned_to_user_id);
create index tickets_unit_idx            on tickets (unit_id);

create table ticket_comments (
  id             uuid primary key default gen_random_uuid(),
  building_id    uuid not null references buildings(id) on delete cascade,
  ticket_id      uuid not null references tickets(id) on delete cascade,
  author_user_id uuid references users(id),
  body           text not null,
  is_internal    boolean not null default false,
  client_uuid    uuid unique,
  created_at     timestamptz not null default now()
);
create index ticket_comments_ticket_idx on ticket_comments (ticket_id, created_at);

-- ─── §2.5 Activos y mantenimiento ─────────────────────────────────────────
create table assets (
  id             uuid primary key default gen_random_uuid(),
  building_id    uuid not null references buildings(id) on delete cascade,
  name           text not null,
  category       text not null,
  location       text,
  serial_number  text,
  installed_on   date,
  vendor_id      uuid,
  warranty_until date,
  criticality    criticality not null default 'normal',
  status         asset_status not null default 'active',
  specs          jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  created_by     uuid
);
create index assets_building_idx on assets (building_id, category);

alter table cases   add constraint cases_asset_fk   foreign key (asset_id) references assets(id);
alter table tickets add constraint tickets_asset_fk foreign key (asset_id) references assets(id);

create table maintenance_plans (
  id                  uuid primary key default gen_random_uuid(),
  building_id         uuid not null references buildings(id) on delete cascade,
  asset_id            uuid references assets(id),
  name                text not null,
  freq                frequency not null,
  interval_count      integer not null default 1,
  start_date          date not null,
  active              boolean not null default true,
  default_assignee_id uuid references users(id),
  checklist           jsonb not null default '[]'::jsonb,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  created_by          uuid
);
create index maintenance_plans_building_idx on maintenance_plans (building_id, active);

create table maintenance_tasks (
  id                   uuid primary key default gen_random_uuid(),
  building_id          uuid not null references buildings(id) on delete cascade,
  plan_id              uuid references maintenance_plans(id),
  asset_id             uuid references assets(id),
  case_id              uuid references cases(id),
  title                text not null,
  due_date             date not null,
  status               task_status not null default 'pending',
  assigned_to_user_id  uuid references users(id),
  completed_by_user_id uuid references users(id),
  completed_at         timestamptz,
  notes                text,
  skip_reason          text,
  cost_amount          numeric(14,2),
  currency             char(3),
  budget_category_id   uuid,
  client_uuid          uuid unique,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  created_by           uuid,
  constraint maintenance_tasks_plan_due_uq unique (plan_id, due_date)
);
create index maintenance_tasks_due_idx on maintenance_tasks (building_id, due_date, status);

create table asset_events (
  id          uuid primary key default gen_random_uuid(),
  building_id uuid not null references buildings(id) on delete cascade,
  asset_id    uuid not null references assets(id) on delete cascade,
  case_id     uuid references cases(id),
  event_type  asset_event_type not null,
  occurred_at timestamptz not null default now(),
  description text,
  cost_amount numeric(14,2),
  currency    char(3),
  created_at  timestamptz not null default now(),
  created_by  uuid references users(id)
);
create index asset_events_asset_idx on asset_events (asset_id, occurred_at);

-- ─── §2.6 Proveedores, presupuestos, aprobaciones y órdenes ───────────────
create table vendors (
  id             uuid primary key default gen_random_uuid(),
  building_id    uuid not null references buildings(id) on delete cascade,
  legal_name     text not null,
  trade_name     text,
  tax_id         text,
  contact_name   text,
  email          text,
  phone          text,
  services       text[] not null default '{}'::text[],
  rating         numeric(3,2),
  status         vendor_status not null default 'active',
  contract_until date,
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  created_by     uuid
);
create index vendors_building_idx on vendors (building_id, status);

alter table assets  add constraint assets_vendor_fk  foreign key (vendor_id) references vendors(id);
alter table tickets add constraint tickets_vendor_fk foreign key (vendor_id) references vendors(id);

create table budget_categories (
  id          uuid primary key default gen_random_uuid(),
  building_id uuid not null references buildings(id) on delete cascade,
  code        text not null,
  name        text not null,
  parent_id   uuid references budget_categories(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid,
  constraint budget_categories_uq unique (building_id, code)
);

alter table maintenance_tasks
  add constraint maintenance_tasks_budget_fk foreign key (budget_category_id) references budget_categories(id);

create table quotes (
  id                 uuid primary key default gen_random_uuid(),
  building_id        uuid not null references buildings(id) on delete cascade,
  case_id            uuid not null references cases(id),
  vendor_id          uuid not null references vendors(id),
  description        text not null,
  amount             numeric(14,2) not null,
  currency           char(3) not null default 'UYU',
  budget_category_id uuid references budget_categories(id),
  lead_time_days     integer,
  valid_until        date,
  status             quote_status not null default 'submitted',
  document_id        uuid,
  submitted_at       timestamptz not null default now(),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  created_by         uuid references users(id)
);
create index quotes_case_idx on quotes (case_id);

-- RN-20: umbral, mínimo de presupuestos y rol aprobador. Configuración, no constantes.
create table governance_rules (
  id                     uuid primary key default gen_random_uuid(),
  building_id            uuid not null references buildings(id) on delete cascade,
  name                   text not null,
  threshold_amount       numeric(14,2) not null,
  currency               char(3) not null default 'UYU',
  min_quotes             integer not null default 1,
  required_approver_role app_role not null,
  active                 boolean not null default true,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  created_by             uuid
);
create index governance_rules_building_idx on governance_rules (building_id, active);

create table approvals (
  id               uuid primary key default gen_random_uuid(),
  building_id      uuid not null references buildings(id) on delete cascade,
  case_id          uuid not null references cases(id),
  subject_type     approval_subject not null,
  subject_id       uuid not null,
  decision         approval_decision not null,
  approved_amount  numeric(14,2),
  currency         char(3),
  approver_user_id uuid not null references users(id),
  approver_role    app_role not null,
  decided_at       timestamptz not null default now(),
  rationale        text,
  supersedes_id    uuid references approvals(id),
  is_exception     boolean not null default false,
  exception_reason text,
  rule_id          uuid references governance_rules(id),
  created_at       timestamptz not null default now(),
  -- RN-02: una excepción sin fundamento no se registra
  constraint approvals_exception_requires_reason
    check (not is_exception or (exception_reason is not null and length(btrim(exception_reason)) >= 10))
);
create index approvals_subject_idx on approvals (subject_type, subject_id);
create index approvals_case_idx    on approvals (case_id);

create table work_orders (
  id                    uuid primary key default gen_random_uuid(),
  building_id           uuid not null references buildings(id) on delete cascade,
  case_id               uuid not null references cases(id),
  vendor_id             uuid not null references vendors(id),
  quote_id              uuid references quotes(id),
  number                bigint not null,
  scope                 text not null,
  amount                numeric(14,2),
  currency              char(3),
  budget_category_id    uuid references budget_categories(id),
  scheduled_for         date,
  started_at            timestamptz,
  completed_at          timestamptz,
  status                wo_status not null default 'draft',
  acceptance_by_user_id uuid references users(id),
  acceptance_at         timestamptz,
  acceptance_notes      text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  created_by            uuid,
  constraint work_orders_building_number_uq unique (building_id, number)
);
create index work_orders_case_idx on work_orders (case_id);

create table invoices (
  id                 uuid primary key default gen_random_uuid(),
  building_id        uuid not null references buildings(id) on delete cascade,
  case_id            uuid references cases(id),
  vendor_id          uuid not null references vendors(id),
  work_order_id      uuid references work_orders(id),
  number             text not null,
  issue_date         date not null,
  amount             numeric(14,2) not null,
  currency           char(3) not null default 'UYU',
  budget_category_id uuid references budget_categories(id),
  status             invoice_status not null default 'received',
  validated_by       uuid references users(id),
  validated_at       timestamptz,
  rejection_reason   text,
  document_id        uuid,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  created_by         uuid
);
create index invoices_case_idx   on invoices (case_id);
create index invoices_vendor_idx on invoices (vendor_id, issue_date);

-- ─── §2.7 Gobernanza: registro de decisiones ──────────────────────────────
create table decisions (
  id                   uuid primary key default gen_random_uuid(),
  building_id          uuid not null references buildings(id) on delete cascade,
  case_id              uuid references cases(id),
  title                text not null,
  body                 text,
  decided_on           date not null,
  decided_by           decision_body not null,
  responsible_user_id  uuid references users(id),
  due_date             date,
  status               decision_status not null default 'pending',
  minutes_document_id  uuid,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  created_by           uuid
);
create index decisions_building_idx on decisions (building_id, status);

-- ─── §2.8 Planillas del encargado (Anexos A–H del Manual) ─────────────────
create table checklist_templates (
  id          uuid primary key default gen_random_uuid(),
  building_id uuid not null references buildings(id) on delete cascade,
  name        text not null,
  freq        frequency not null,
  items       jsonb not null,
  seasonal    boolean not null default false,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid
);
create index checklist_templates_building_idx on checklist_templates (building_id, active);

create table checklist_instances (
  id                  uuid primary key default gen_random_uuid(),
  building_id         uuid not null references buildings(id) on delete cascade,
  template_id         uuid not null references checklist_templates(id),
  period_date         date not null,
  status              checklist_status not null default 'pending',
  assigned_to_user_id uuid references users(id),
  completed_at        timestamptz,
  client_uuid         uuid unique,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  created_by          uuid,
  constraint checklist_instances_uq unique (template_id, period_date)
);
create index checklist_instances_date_idx on checklist_instances (building_id, period_date);

create table checklist_item_results (
  id                uuid primary key default gen_random_uuid(),
  building_id       uuid not null references buildings(id) on delete cascade,
  instance_id       uuid not null references checklist_instances(id) on delete cascade,
  item_key          text not null,
  label             text not null,
  required          boolean not null default true,
  done              boolean not null default false,
  note              text,
  photo_document_id uuid,
  completed_at      timestamptz,
  completed_by      uuid references users(id),
  client_uuid       uuid unique,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint checklist_item_results_uq unique (instance_id, item_key)
);

-- Anexo A del Manual
create table pool_logs (
  id                  uuid primary key default gen_random_uuid(),
  building_id         uuid not null references buildings(id) on delete cascade,
  case_id             uuid references cases(id),
  logged_on           date not null,
  logged_at           timestamptz not null default now(),
  free_chlorine       numeric(5,2),
  ph                  numeric(4,2),
  alkalinity          numeric(6,2),
  calcium_hardness    numeric(6,2),
  skimmed             boolean,
  baskets_cleaned     boolean,
  products_applied    text,
  observations        text,
  out_of_range        boolean not null default false,
  out_of_range_params text[],
  backdate_reason     text,
  logged_by           uuid references users(id),
  client_uuid         uuid unique,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  -- ESPEC §4.3: un registro duplicado para la misma fecha y hora se rechaza
  constraint pool_logs_slot_uq unique (building_id, logged_on, logged_at)
);
create index pool_logs_date_idx on pool_logs (building_id, logged_on);

-- Anexo B
create table approved_task_logs (
  id                  uuid primary key default gen_random_uuid(),
  building_id         uuid not null references buildings(id) on delete cascade,
  case_id             uuid references cases(id),
  performed_on        date not null,
  trade               trade not null,
  description         text not null,
  materials           text,
  time_spent_minutes  integer,
  status              text not null default 'done',
  escalated           boolean not null default false,
  escalation_reason   text,
  escalated_ticket_id uuid references tickets(id),
  cost_amount         numeric(14,2),
  currency            char(3),
  budget_category_id  uuid references budget_categories(id),
  logged_by           uuid references users(id),
  client_uuid         uuid unique,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index approved_task_logs_date_idx on approved_task_logs (building_id, performed_on);

-- Anexo F
create table incidents (
  id            uuid primary key default gen_random_uuid(),
  building_id   uuid not null references buildings(id) on delete cascade,
  case_id       uuid references cases(id),
  occurred_at   timestamptz not null,
  incident_type incident_type not null,
  description   text not null,
  action_taken  text,
  notified_to   text,
  status        text not null default 'open',
  logged_by     uuid references users(id),
  client_uuid   uuid unique,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index incidents_date_idx on incidents (building_id, occurred_at);

-- Anexo E
create table stock_items (
  id                    uuid primary key default gen_random_uuid(),
  building_id           uuid not null references buildings(id) on delete cascade,
  name                  text not null,
  unit_of_measure       text,
  min_quantity          numeric(12,2) not null default 0,
  current_quantity      numeric(12,2) not null default 0,
  low_stock_notified_at timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  created_by            uuid
);
create index stock_items_building_idx on stock_items (building_id);

create table stock_movements (
  id            uuid primary key default gen_random_uuid(),
  building_id   uuid not null references buildings(id) on delete cascade,
  stock_item_id uuid not null references stock_items(id),
  kind          stock_movement_kind not null,
  quantity      numeric(12,2) not null,
  reason        text,
  occurred_at   timestamptz not null default now(),
  logged_by     uuid references users(id),
  client_uuid   uuid unique,
  created_at    timestamptz not null default now()
);
create index stock_movements_item_idx on stock_movements (stock_item_id, occurred_at);

-- Anexo D
create table staff_notes (
  id             uuid primary key default gen_random_uuid(),
  building_id    uuid not null references buildings(id) on delete cascade,
  party_id       uuid references parties(id),
  note_date      date not null,
  kind           staff_note_kind not null,
  description    text not null,
  notified_admin boolean not null default false,
  logged_by      uuid references users(id),
  client_uuid    uuid unique,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index staff_notes_date_idx on staff_notes (building_id, note_date);

-- RN-42: un informe enviado no se edita; una corrección genera una versión nueva
create table monthly_reports (
  id                    uuid primary key default gen_random_uuid(),
  building_id           uuid not null references buildings(id) on delete cascade,
  period_month          date not null,
  version               integer not null default 1,
  supersedes_id         uuid references monthly_reports(id),
  status                monthly_report_status not null default 'draft',
  content               jsonb not null,
  narrative             text,
  control_justification text,
  generated_at          timestamptz not null default now(),
  submitted_at          timestamptz,
  submitted_by          uuid references users(id),
  pdf_document_id       uuid,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  created_by            uuid,
  constraint monthly_reports_uq unique (building_id, period_month, version)
);

-- ─── §2.9 Documentos ──────────────────────────────────────────────────────
create table documents (
  id           uuid primary key default gen_random_uuid(),
  building_id  uuid not null references buildings(id) on delete cascade,
  title        text not null,
  doc_type     text not null,
  storage_path text not null,
  mime_type    text,
  size_bytes   bigint,
  checksum     text,
  issued_on    date,
  expires_on   date,
  visibility   doc_visibility not null default 'internal',
  upload_state text not null default 'confirmed',
  uploaded_by  uuid references users(id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  created_by   uuid
);
create index documents_expiry_idx on documents (building_id, expires_on);
create index documents_type_idx   on documents (building_id, doc_type);

create table document_links (
  id          uuid primary key default gen_random_uuid(),
  document_id uuid not null references documents(id) on delete cascade,
  entity_type text not null,
  entity_id   uuid not null,
  created_at  timestamptz not null default now(),
  constraint document_links_uq unique (document_id, entity_type, entity_id)
);
create index document_links_entity_idx on document_links (entity_type, entity_id);

-- ─── §2.10 Auditoría, notificaciones y outbox ─────────────────────────────
create table audit_log (
  id             bigint generated always as identity primary key,
  building_id    uuid,
  occurred_at    timestamptz not null default now(),
  actor_user_id  uuid,
  actor_role     text,
  entity_type    text not null,
  entity_id      uuid,
  action         text not null,
  before         jsonb,
  after          jsonb,
  changed_fields text[],
  request_id     text
);
create index audit_log_building_time_idx on audit_log (building_id, occurred_at desc);
create index audit_log_entity_idx        on audit_log (entity_type, entity_id);

create table notifications (
  id          uuid primary key default gen_random_uuid(),
  building_id uuid not null references buildings(id) on delete cascade,
  user_id     uuid not null references users(id) on delete cascade,
  notif_type  text not null,
  title       text not null,
  body        text,
  entity_type text,
  entity_id   uuid,
  channel     notification_channel not null default 'email',
  status      notification_status not null default 'pending',
  digest_key  text,
  sent_at     timestamptz,
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index notifications_user_idx   on notifications (user_id, created_at desc);
create index notifications_status_idx on notifications (status);

create table outbox (
  id           bigint generated always as identity primary key,
  building_id  uuid references buildings(id) on delete cascade,
  topic        text not null,
  payload      jsonb not null,
  status       outbox_status not null default 'pending',
  attempts     integer not null default 0,
  available_at timestamptz not null default now(),
  last_error   text,
  created_at   timestamptz not null default now(),
  processed_at timestamptz
);
create index outbox_status_idx on outbox (status, available_at);

-- ─── §2.11 Cumplimiento ───────────────────────────────────────────────────
create table compliance_snapshots (
  id                  uuid primary key default gen_random_uuid(),
  building_id         uuid not null references buildings(id) on delete cascade,
  snapshot_date       date not null,
  required_items      integer not null default 0,
  completed_items     integer not null default 0,
  compliance_pct      numeric(5,2) not null default 0,
  day_status          day_status not null,
  pool_logged         boolean,
  pool_out_of_range   boolean,
  missing_streak_days integer not null default 0,
  missing_item_keys   text[],
  computed_at         timestamptz not null default now(),
  constraint compliance_snapshots_uq unique (building_id, snapshot_date)
);
create index compliance_snapshots_date_idx on compliance_snapshots (building_id, snapshot_date desc);

create table job_runs (
  id          uuid primary key default gen_random_uuid(),
  job_name    text not null,
  run_key     text not null,
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  status      text not null default 'running',
  result      jsonb,
  error       text,
  constraint job_runs_uq unique (job_name, run_key)
);

create table sync_receipts (
  client_uuid uuid primary key,
  building_id uuid not null references buildings(id) on delete cascade,
  endpoint    text not null,
  entity_type text,
  entity_id   uuid,
  result      text not null,
  created_at  timestamptz not null default now()
);
create index sync_receipts_building_idx on sync_receipts (building_id, created_at);

-- FKs diferidas que cierran los ciclos
alter table quotes            add constraint quotes_document_fk          foreign key (document_id)         references documents(id);
alter table invoices          add constraint invoices_document_fk        foreign key (document_id)         references documents(id);
alter table decisions         add constraint decisions_minutes_fk        foreign key (minutes_document_id) references documents(id);
alter table monthly_reports   add constraint monthly_reports_pdf_fk      foreign key (pdf_document_id)     references documents(id);
alter table checklist_item_results add constraint cir_photo_fk           foreign key (photo_document_id)   references documents(id);

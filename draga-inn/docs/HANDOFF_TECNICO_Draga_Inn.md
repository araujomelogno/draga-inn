# Hand-off técnico — Sistema de Gestión y Gobernanza del Edificio

**Documento de implementación para Claude Code**
**Proyecto:** Draga — Edificio Draga Inn, Punta del Este, Uruguay
**Versión:** 1.0 — 13/09/2026
**Documento de producto asociado:** `PRD_Sistema_Gestion_Gobernanza_Draga_Inn.md`

---

## 0. Cómo usar este documento

Este documento es la especificación técnica para implementar el v1. Está pensado para trabajarse con Claude Code en un flujo de **ramas y PRs revisados en GitHub** (una rama por PR de la sección 11, nunca commits directos a `main`).

**Reglas no negociables del proyecto** — si una decisión de implementación las contradice, la decisión está mal:

1. **Todo hecho pertenece a un expediente.** Ninguna entidad de dominio se crea "suelta".
2. **Todo se audita.** La auditoría se hace en la base de datos, no en la aplicación, para que no pueda saltearse.
3. **Todo está scopeado a un edificio.** `building_id` en cada tabla de dominio, en cada query, sin excepción.
4. **Todo hecho económico lleva monto, rubro y autorización** — aunque el v1 no calcule expensas.
5. **La PWA del encargado funciona sin conexión.** Si una funcionalidad no soporta offline, no va en la PWA.

---

## 1. Arquitectura

```
┌──────────────────────────────────────────────────────────────┐
│  Clientes                                                    │
│  ┌────────────────┐ ┌──────────────────┐ ┌────────────────┐ │
│  │ PWA Encargado  │ │ Consola Admin    │ │ Portal Propiet.│ │
│  │ (offline-first)│ │ (escritorio)     │ │ (responsive)   │ │
│  └────────────────┘ └──────────────────┘ └────────────────┘ │
│         Next.js 15 (App Router) · TypeScript · React          │
└───────────────────────────┬──────────────────────────────────┘
                            │ HTTPS · Bearer <Firebase ID token>
┌───────────────────────────▼──────────────────────────────────┐
│  Next.js Route Handlers (API)  — Cloud Run                    │
│  ├─ verifyIdToken (firebase-admin)                            │
│  ├─ AuthContext { user, building, roles }                     │
│  ├─ Policy layer  can(action, subject, resource)              │
│  ├─ Repositories  (siempre scopeados por building_id)         │
│  └─ SET LOCAL app.user_id  → habilita triggers de auditoría   │
└──────┬───────────────────────────┬────────────────┬──────────┘
       │                           │                │
┌──────▼────────────┐  ┌───────────▼──────┐  ┌──────▼─────────┐
│ Cloud SQL         │  │ Cloud Storage    │  │ Firebase Auth  │
│ PostgreSQL 16     │  │ (documentos,     │  │ (identidad)    │
│ SISTEMA DE        │  │  fotos)          │  │                │
│ REGISTRO          │  │ signed URLs v4   │  │                │
└───────────────────┘  └──────────────────┘  └────────────────┘
       │
┌──────▼──────────────────────────────────────────────────────┐
│ Cloud Scheduler → Cloud Run jobs                             │
│  · generación de tareas preventivas (diario)                 │
│  · detección de vencimientos y tareas vencidas (diario)      │
│  · cómputo de cumplimiento y tendencias (diario 20:00)       │
│  · generación del informe mensual (mensual)                  │
│  · despacho del outbox de notificaciones (cada 5 min)        │
└─────────────────────────────────────────────────────────────┘
```

### 1.1. Decisiones de stack y por qué

| Componente | Elección | Razón |
|---|---|---|
| **Base de datos** | **Cloud SQL PostgreSQL 16** | El dominio es relacional y auditable: expediente encadenado, titularidad histórica, prorrateo futuro. Firestore obligaría a denormalizar y haría muy costoso el v2 financiero |
| Framework | Next.js 15 (App Router) + TypeScript | Una sola base para las tres superficies; server components para la consola, cliente para la PWA |
| ORM / migraciones | **Drizzle ORM** + drizzle-kit | SQL-first, migraciones versionadas legibles, tipos inferidos del esquema. Funciona bien con generación asistida |
| Identidad | **Firebase Auth** | Ya en el stack. Email/password + magic link. Verificación server-side con `firebase-admin` |
| Archivos | **Cloud Storage** | Signed URLs v4 para subida y descarga directas, sin pasar por el servidor |
| Hosting | **Cloud Run** + Firebase Hosting (rewrite) | Contenedor con acceso a Cloud SQL por conector; Firebase Hosting como CDN y dominio |
| Jobs | Cloud Scheduler → Cloud Run Jobs | Preventivos, vencimientos, informe mensual, outbox |
| Validación | **zod** | Esquemas compartidos entre cliente y servidor |
| Offline | Service Worker (Workbox) + IndexedDB (`idb`) | Cola de mutaciones con reintento e idempotencia |
| Notificaciones | Outbox en Postgres → worker → **Resend** (email); WhatsApp vía **n8n** (P1) | Entrega confiable y desacoplada |
| Tests | Vitest (unit/integración) + Playwright (e2e) | |
| PDF | `@react-pdf/renderer` en Cloud Run job | Informe mensual y planillas |

### 1.2. Lo que explícitamente NO se usa

- **Firestore.** Se evaluó y se descartó como sistema de registro (ver PRD §11 A7). Firebase se usa solo para Auth, Storage y Hosting.
- **RLS de Postgres.** Al no usar Supabase, la identidad no llega a la base; la autorización se aplica en la capa de aplicación. La base sí usa triggers para auditoría (que no se pueden saltear) y constraints para integridad.
- **Pagos, pasarelas y conciliación.** Fuera del v1.

---

## 2. Modelo de datos

Convenciones: `snake_case`; PKs `uuid` con `gen_random_uuid()`; timestamps `timestamptz`; montos `numeric(14,2)` con `currency char(3)`; toda tabla de dominio tiene `building_id`, `created_at`, `updated_at`, `created_by`.

### 2.1. Tenencia y estructura

```sql
create table buildings (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  legal_name    text,
  address       text,
  city          text default 'Punta del Este',
  department    text default 'Maldonado',
  country       char(2) default 'UY',
  timezone      text not null default 'America/Montevideo',
  currency      char(3) not null default 'UYU',
  settings      jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table sectors (              -- torre, bloque o sector
  id          uuid primary key default gen_random_uuid(),
  building_id uuid not null references buildings(id) on delete cascade,
  name        text not null,
  kind        text not null default 'tower'  -- tower | block | sector
);

create type unit_type as enum ('apartment','parking','storage','commercial','common');

create table units (
  id             uuid primary key default gen_random_uuid(),
  building_id    uuid not null references buildings(id) on delete cascade,
  sector_id      uuid references sectors(id),
  code           text not null,                    -- '302', 'C-27', 'B14'
  unit_type      unit_type not null default 'apartment',
  floor          text,
  coefficient    numeric(7,4),                     -- % de copropiedad
  area_m2        numeric(10,2),
  parent_unit_id uuid references units(id),        -- cochera/baulera → unidad
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (building_id, code)
);

create table common_areas (
  id          uuid primary key default gen_random_uuid(),
  building_id uuid not null references buildings(id) on delete cascade,
  name        text not null,          -- piscina, parrillero, SUM, parque
  kind        text,
  bookable    boolean not null default false
);
```

### 2.2. Personas, usuarios y roles

```sql
create table parties (
  id           uuid primary key default gen_random_uuid(),
  building_id  uuid not null references buildings(id) on delete cascade,
  kind         text not null default 'person',   -- person | company
  full_name    text not null,
  doc_type     text,                              -- CI, RUT, pasaporte
  doc_number   text,
  email        text,
  phone        text,
  country      char(2),
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create type occupancy_role as enum ('owner','tenant','occupant');

-- Titularidad histórica: quién era qué cosa, y cuándo
create table unit_occupancies (
  id           uuid primary key default gen_random_uuid(),
  building_id  uuid not null references buildings(id) on delete cascade,
  unit_id      uuid not null references units(id) on delete cascade,
  party_id     uuid not null references parties(id),
  role         occupancy_role not null,
  period       daterange not null,                -- [desde, hasta)  hasta = null ⇒ vigente
  is_primary   boolean not null default true,
  created_at   timestamptz not null default now(),
  created_by   uuid,
  -- no puede haber dos propietarios principales solapados en la misma unidad
  exclude using gist (
    unit_id with =, role with =, period with &&
  ) where (is_primary)
);
create index on unit_occupancies (unit_id, role);

create type app_role as enum
  ('owner','tenant','encargado','administrador','comision','contador','auditor');

create table users (
  id            uuid primary key default gen_random_uuid(),
  firebase_uid  text not null unique,
  email         text not null,
  display_name  text,
  party_id      uuid references parties(id),
  is_active     boolean not null default true,
  last_login_at timestamptz,
  created_at    timestamptz not null default now()
);

create table memberships (          -- un usuario puede tener varios roles en un edificio
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references users(id) on delete cascade,
  building_id uuid not null references buildings(id) on delete cascade,
  role        app_role not null,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (user_id, building_id, role)
);
```

### 2.3. Expediente — el spine

```sql
create type case_status as enum ('open','in_progress','waiting','resolved','closed','cancelled');

create table cases (
  id           uuid primary key default gen_random_uuid(),
  building_id  uuid not null references buildings(id) on delete cascade,
  number       bigint not null,                 -- correlativo por edificio
  title        text not null,
  category     text,
  status       case_status not null default 'open',
  unit_id      uuid references units(id),
  asset_id     uuid,                            -- FK agregada tras crear assets
  summary      text,
  opened_by    uuid references users(id),
  opened_at    timestamptz not null default now(),
  closed_at    timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (building_id, number)
);

-- Línea de tiempo append-only del expediente
create table case_events (
  id           uuid primary key default gen_random_uuid(),
  building_id  uuid not null references buildings(id) on delete cascade,
  case_id      uuid not null references cases(id) on delete cascade,
  event_type   text not null,        -- ticket_created, quote_submitted, approved, wo_issued, ...
  entity_type  text,
  entity_id    uuid,
  actor_user_id uuid references users(id),
  occurred_at  timestamptz not null default now(),
  note         text,
  payload      jsonb not null default '{}'::jsonb
);
create index on case_events (case_id, occurred_at);
```

> **Regla de implementación:** `case_events` es **append-only**. Nunca se hace `UPDATE` ni `DELETE`. Se revoca con un evento compensatorio.

### 2.4. Tickets

```sql
create type ticket_status as enum
  ('new','triage','assigned','in_progress','waiting_owner','resolved','closed');
create type ticket_priority as enum ('low','normal','high','critical');

create table tickets (
  id                 uuid primary key default gen_random_uuid(),
  building_id        uuid not null references buildings(id) on delete cascade,
  case_id            uuid not null references cases(id),
  number             bigint not null,
  unit_id            uuid references units(id),
  common_area_id     uuid references common_areas(id),
  asset_id           uuid,
  title              text not null,
  description        text,
  category           text not null,
  priority           ticket_priority not null default 'normal',
  status             ticket_status not null default 'new',
  reported_by_user_id uuid references users(id),
  assigned_to_user_id uuid references users(id),
  vendor_id          uuid,
  due_date           date,
  resolved_at        timestamptz,
  closed_at          timestamptz,
  source             text not null default 'admin',   -- portal | pwa | admin | whatsapp
  client_uuid        uuid unique,                     -- idempotencia offline
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  created_by         uuid references users(id),
  unique (building_id, number)
);

create table ticket_comments (
  id           uuid primary key default gen_random_uuid(),
  building_id  uuid not null,
  ticket_id    uuid not null references tickets(id) on delete cascade,
  author_user_id uuid references users(id),
  body         text not null,
  is_internal  boolean not null default false,  -- true ⇒ no visible al propietario
  client_uuid  uuid unique,
  created_at   timestamptz not null default now()
);
```

### 2.5. Activos y mantenimiento

```sql
create table assets (
  id             uuid primary key default gen_random_uuid(),
  building_id    uuid not null references buildings(id) on delete cascade,
  name           text not null,
  category       text not null,        -- ascensor, bomba, tablero, portón, cámara, piscina, incendio
  location       text,
  serial_number  text,
  installed_on   date,
  vendor_id      uuid,
  warranty_until date,
  criticality    text not null default 'normal',  -- low | normal | critical
  status         text not null default 'active',
  specs          jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
alter table cases   add constraint cases_asset_fk   foreign key (asset_id) references assets(id);
alter table tickets add constraint tickets_asset_fk foreign key (asset_id) references assets(id);

create type frequency as enum ('daily','weekly','monthly','quarterly','biannual','annual','seasonal');

create table maintenance_plans (
  id                    uuid primary key default gen_random_uuid(),
  building_id           uuid not null references buildings(id) on delete cascade,
  asset_id              uuid references assets(id),
  name                  text not null,
  freq                  frequency not null,
  interval_count        int not null default 1,
  start_date            date not null,
  active                boolean not null default true,
  default_assignee_id   uuid references users(id),
  checklist             jsonb not null default '[]'::jsonb,
  created_at            timestamptz not null default now()
);

create type task_status as enum ('pending','done','overdue','skipped');

create table maintenance_tasks (
  id                uuid primary key default gen_random_uuid(),
  building_id       uuid not null references buildings(id) on delete cascade,
  plan_id           uuid references maintenance_plans(id),
  asset_id          uuid references assets(id),
  case_id           uuid references cases(id),
  title             text not null,
  due_date          date not null,
  status            task_status not null default 'pending',
  assigned_to_user_id uuid references users(id),
  completed_by_user_id uuid references users(id),
  completed_at      timestamptz,
  notes             text,
  cost_amount       numeric(14,2),
  currency          char(3),
  budget_category_id uuid,
  client_uuid       uuid unique,
  created_at        timestamptz not null default now(),
  unique (plan_id, due_date)      -- evita duplicar la generación automática
);

create table asset_events (
  id           uuid primary key default gen_random_uuid(),
  building_id  uuid not null,
  asset_id     uuid not null references assets(id) on delete cascade,
  case_id      uuid references cases(id),
  event_type   text not null,     -- failure | repair | inspection | replacement
  occurred_at  timestamptz not null default now(),
  description  text,
  cost_amount  numeric(14,2),
  currency     char(3),
  created_by   uuid references users(id)
);
```

### 2.6. Proveedores, presupuestos, aprobaciones y órdenes de trabajo

```sql
create table vendors (
  id           uuid primary key default gen_random_uuid(),
  building_id  uuid not null references buildings(id) on delete cascade,
  legal_name   text not null,
  trade_name   text,
  tax_id       text,                -- RUT
  contact_name text,
  email        text,
  phone        text,
  services     text[] not null default '{}',
  rating       numeric(3,2),
  status       text not null default 'active',
  notes        text,
  created_at   timestamptz not null default now()
);
alter table assets  add constraint assets_vendor_fk  foreign key (vendor_id) references vendors(id);
alter table tickets add constraint tickets_vendor_fk foreign key (vendor_id) references vendors(id);

create table budget_categories (    -- rubros: necesarios ya en v1 (regla 4)
  id           uuid primary key default gen_random_uuid(),
  building_id  uuid not null references buildings(id) on delete cascade,
  code         text not null,
  name         text not null,
  parent_id    uuid references budget_categories(id),
  unique (building_id, code)
);

create type quote_status as enum ('submitted','approved','rejected','expired','superseded');

create table quotes (
  id           uuid primary key default gen_random_uuid(),
  building_id  uuid not null references buildings(id) on delete cascade,
  case_id      uuid not null references cases(id),
  vendor_id    uuid not null references vendors(id),
  description  text not null,
  amount       numeric(14,2) not null,
  currency     char(3) not null default 'UYU',
  budget_category_id uuid references budget_categories(id),
  valid_until  date,
  status       quote_status not null default 'submitted',
  document_id  uuid,
  submitted_at timestamptz not null default now(),
  created_by   uuid references users(id)
);

-- Reglas de gobernanza configurables por edificio
create table governance_rules (
  id                    uuid primary key default gen_random_uuid(),
  building_id           uuid not null references buildings(id) on delete cascade,
  name                  text not null,
  threshold_amount      numeric(14,2) not null,
  currency              char(3) not null default 'UYU',
  min_quotes            int not null default 1,
  required_approver_role app_role not null,
  active                boolean not null default true
);

create table approvals (
  id                 uuid primary key default gen_random_uuid(),
  building_id        uuid not null references buildings(id) on delete cascade,
  case_id            uuid not null references cases(id),
  subject_type       text not null,      -- quote | work_order | invoice | decision
  subject_id         uuid not null,
  decision           text not null,      -- approved | rejected
  approved_amount    numeric(14,2),
  currency           char(3),
  approver_user_id   uuid not null references users(id),
  approver_role      app_role not null,
  decided_at         timestamptz not null default now(),
  rationale          text,
  supersedes_id      uuid references approvals(id),
  is_exception       boolean not null default false,
  exception_reason   text,
  rule_id            uuid references governance_rules(id)
);
```

> **Inmutabilidad:** `approvals` no se actualiza. Una corrección crea una nueva fila con `supersedes_id`. Enforzar con un trigger `BEFORE UPDATE` que lance excepción.

```sql
create type wo_status as enum ('draft','issued','in_progress','completed','accepted','cancelled');

create table work_orders (
  id                  uuid primary key default gen_random_uuid(),
  building_id         uuid not null references buildings(id) on delete cascade,
  case_id             uuid not null references cases(id),
  vendor_id           uuid not null references vendors(id),
  quote_id            uuid references quotes(id),
  number              bigint not null,
  scope               text not null,
  scheduled_for       date,
  started_at          timestamptz,
  completed_at        timestamptz,
  status              wo_status not null default 'draft',
  acceptance_by_user_id uuid references users(id),
  acceptance_at       timestamptz,
  acceptance_notes    text,
  created_at          timestamptz not null default now(),
  unique (building_id, number)
);

create table invoices (             -- v1: registro y validación, sin pagos
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
  status             text not null default 'received',  -- received|validated|rejected|paid
  validated_by       uuid references users(id),
  validated_at       timestamptz,
  document_id        uuid,
  created_at         timestamptz not null default now()
);
```

### 2.7. Gobernanza (registro de decisiones — v1 parcial)

```sql
create table decisions (
  id                 uuid primary key default gen_random_uuid(),
  building_id        uuid not null references buildings(id) on delete cascade,
  case_id            uuid references cases(id),
  title              text not null,
  body               text,
  decided_on         date not null,
  decided_by         text not null,     -- comision | asamblea | administrador
  responsible_user_id uuid references users(id),
  due_date           date,
  status             text not null default 'pending',  -- pending|in_progress|done|cancelled
  minutes_document_id uuid,
  created_at         timestamptz not null default now()
);
```

### 2.8. Planillas del encargado *(gancho de adopción — replican los Anexos A–H del Manual)*

```sql
create table checklist_templates (
  id          uuid primary key default gen_random_uuid(),
  building_id uuid not null references buildings(id) on delete cascade,
  name        text not null,
  freq        frequency not null,
  items       jsonb not null,     -- [{key, label, required, section}]
  active      boolean not null default true
);

create table checklist_instances (
  id                  uuid primary key default gen_random_uuid(),
  building_id         uuid not null references buildings(id) on delete cascade,
  template_id         uuid not null references checklist_templates(id),
  period_date         date not null,
  status              text not null default 'pending',   -- pending|partial|complete
  assigned_to_user_id uuid references users(id),
  completed_at        timestamptz,
  client_uuid         uuid unique,
  unique (template_id, period_date)
);

create table checklist_item_results (
  id           uuid primary key default gen_random_uuid(),
  building_id  uuid not null,
  instance_id  uuid not null references checklist_instances(id) on delete cascade,
  item_key     text not null,
  label        text not null,
  done         boolean not null default false,
  note         text,
  photo_document_id uuid,
  completed_at timestamptz,
  completed_by uuid references users(id),
  unique (instance_id, item_key)
);

-- Anexo A del Manual
create table pool_logs (
  id              uuid primary key default gen_random_uuid(),
  building_id     uuid not null references buildings(id) on delete cascade,
  logged_on       date not null,
  logged_at       timestamptz not null default now(),
  free_chlorine   numeric(5,2),      -- rango 1–3 ppm
  ph              numeric(4,2),      -- rango 7,2–7,6
  alkalinity      numeric(6,2),      -- rango 80–120 ppm
  calcium_hardness numeric(6,2),
  skimmed         boolean,
  baskets_cleaned boolean,
  products_applied text,
  observations    text,
  out_of_range    boolean not null default false,
  logged_by       uuid references users(id),
  client_uuid     uuid unique,
  created_at      timestamptz not null default now()
);

-- Anexo B: tareas de mantenimiento aprobadas por la Administración
create table approved_task_logs (
  id                uuid primary key default gen_random_uuid(),
  building_id       uuid not null references buildings(id) on delete cascade,
  case_id           uuid references cases(id),
  performed_on      date not null,
  trade             text not null,   -- masonry|electrical|carpentry|plumbing|painting|other
  description       text not null,
  materials         text,
  time_spent_minutes int,
  status            text not null default 'done',
  escalated         boolean not null default false,   -- derivado a técnico
  escalation_reason text,
  cost_amount       numeric(14,2),
  currency          char(3),
  budget_category_id uuid references budget_categories(id),
  logged_by         uuid references users(id),
  client_uuid       uuid unique
);

-- Anexo F: incidentes y emergencias
create table incidents (
  id           uuid primary key default gen_random_uuid(),
  building_id  uuid not null references buildings(id) on delete cascade,
  case_id      uuid references cases(id),
  occurred_at  timestamptz not null,
  incident_type text not null,
  description  text not null,
  action_taken text,
  notified_to  text,
  status       text not null default 'open',
  logged_by    uuid references users(id),
  client_uuid  uuid unique
);

-- Anexo E: stock de insumos críticos
create table stock_items (
  id               uuid primary key default gen_random_uuid(),
  building_id      uuid not null references buildings(id) on delete cascade,
  name             text not null,
  unit_of_measure  text,
  min_quantity     numeric(12,2) not null default 0,
  current_quantity numeric(12,2) not null default 0
);

create table stock_movements (
  id            uuid primary key default gen_random_uuid(),
  building_id   uuid not null references buildings(id) on delete cascade,
  stock_item_id uuid not null references stock_items(id),
  kind          text not null,        -- in | out | adjust
  quantity      numeric(12,2) not null,
  reason        text,
  occurred_at   timestamptz not null default now(),
  logged_by     uuid references users(id),
  client_uuid   uuid unique
);

-- Anexo D: novedades del personal a cargo
create table staff_notes (
  id           uuid primary key default gen_random_uuid(),
  building_id  uuid not null references buildings(id) on delete cascade,
  party_id     uuid references parties(id),
  note_date    date not null,
  kind         text not null,   -- attendance|leave|day_off|replacement|training|sanction
  description  text not null,
  notified_admin boolean not null default false,
  logged_by    uuid references users(id)
);

-- Informe mensual (sección 8 del Manual) — generado automáticamente
create table monthly_reports (
  id            uuid primary key default gen_random_uuid(),
  building_id   uuid not null references buildings(id) on delete cascade,
  period_month  date not null,            -- primer día del mes
  status        text not null default 'draft',   -- draft | submitted
  content       jsonb not null,           -- agregados calculados
  narrative     text,                     -- texto libre editable por el encargado
  generated_at  timestamptz not null default now(),
  submitted_at  timestamptz,
  submitted_by  uuid references users(id),
  pdf_document_id uuid,
  unique (building_id, period_month)
);
```

### 2.9. Documentos

```sql
create type doc_visibility as enum ('internal','committee','owners','public');

create table documents (
  id            uuid primary key default gen_random_uuid(),
  building_id   uuid not null references buildings(id) on delete cascade,
  title         text not null,
  doc_type      text not null,   -- acta|reglamento|contrato|factura|presupuesto|seguro|
                                  -- certificado|plano|permiso|informe|garantia|foto|otro
  storage_path  text not null,   -- gs://bucket/building/<id>/<yyyy>/<uuid>-<slug>
  mime_type     text,
  size_bytes    bigint,
  checksum      text,
  issued_on     date,
  expires_on    date,            -- alimenta el tablero de riesgos
  visibility    doc_visibility not null default 'internal',
  uploaded_by   uuid references users(id),
  created_at    timestamptz not null default now()
);

-- Vínculo polimórfico: un documento puede colgar de varias entidades
create table document_links (
  id          uuid primary key default gen_random_uuid(),
  document_id uuid not null references documents(id) on delete cascade,
  entity_type text not null,   -- unit|party|asset|vendor|case|ticket|work_order|
                               -- invoice|decision|building|pool_log|maintenance_task
  entity_id   uuid not null,
  unique (document_id, entity_type, entity_id)
);
create index on document_links (entity_type, entity_id);
```

### 2.10. Auditoría, notificaciones y outbox

```sql
create table audit_log (
  id             bigserial primary key,
  building_id    uuid,
  occurred_at    timestamptz not null default now(),
  actor_user_id  uuid,
  actor_role     text,
  entity_type    text not null,
  entity_id      uuid,
  action         text not null,      -- INSERT | UPDATE | DELETE
  before         jsonb,
  after          jsonb,
  changed_fields text[],
  request_id     text
);
create index on audit_log (building_id, occurred_at desc);
create index on audit_log (entity_type, entity_id);

create table notifications (
  id           uuid primary key default gen_random_uuid(),
  building_id  uuid not null,
  user_id      uuid not null references users(id) on delete cascade,
  notif_type   text not null,
  title        text not null,
  body         text,
  entity_type  text,
  entity_id    uuid,
  channel      text not null default 'email',   -- email | inapp | whatsapp
  status       text not null default 'pending',
  sent_at      timestamptz,
  read_at      timestamptz,
  created_at   timestamptz not null default now()
);

create table outbox (               -- despacho confiable
  id           bigserial primary key,
  topic        text not null,
  payload      jsonb not null,
  status       text not null default 'pending',  -- pending|processing|done|failed
  attempts     int not null default 0,
  last_error   text,
  created_at   timestamptz not null default now(),
  processed_at timestamptz
);
create index on outbox (status, created_at);
```

### 2.11. Cumplimiento y análisis operativo

No requiere entidades nuevas de dominio: se calcula sobre lo que ya registra §2.8. Solo se agrega una tabla de instantáneas (para no recalcular series históricas) y un conjunto de vistas.

```sql
-- Instantánea diaria de cumplimiento por edificio
create table compliance_snapshots (
  id                  uuid primary key default gen_random_uuid(),
  building_id         uuid not null references buildings(id) on delete cascade,
  snapshot_date       date not null,
  required_items      int not null default 0,
  completed_items     int not null default 0,
  compliance_pct      numeric(5,2) not null default 0,
  day_status          text not null,     -- complete | partial | missing
  pool_logged         boolean,           -- null = fuera de temporada (RN-52)
  missing_streak_days int not null default 0,
  computed_at         timestamptz not null default now(),
  unique (building_id, snapshot_date)
);
create index on compliance_snapshots (building_id, snapshot_date desc);
```

**Vistas de análisis** (materializar solo si el rendimiento lo exige):

```sql
-- Cumplimiento por instancia de checklist, contando SOLO ítems requeridos (RN-48)
create view v_checklist_compliance as
select ci.building_id, ci.id as instance_id, ci.template_id, ci.period_date,
       count(*) filter (where (it.value->>'required')::boolean) as required_items,
       count(*) filter (where (it.value->>'required')::boolean and r.done) as completed_items,
       round(100.0 * count(*) filter (where (it.value->>'required')::boolean and r.done)
             / nullif(count(*) filter (where (it.value->>'required')::boolean), 0), 2) as pct
from checklist_instances ci
join checklist_templates t on t.id = ci.template_id
cross join lateral jsonb_array_elements(t.items) it
left join checklist_item_results r
       on r.instance_id = ci.id and r.item_key = it.value->>'key'
group by ci.building_id, ci.id, ci.template_id, ci.period_date;

-- Ítems sistemáticamente omitidos en los últimos 30 días (RN-46)
create view v_omitted_items as
select ci.building_id, ci.template_id, r.item_key, max(r.label) as label,
       count(*) as occurrences,
       count(*) filter (where not r.done) as times_missed,
       round(100.0 * count(*) filter (where not r.done) / count(*), 2) as miss_pct
from checklist_instances ci
join checklist_item_results r on r.instance_id = ci.id
where ci.period_date >= current_date - interval '30 days'
group by ci.building_id, ci.template_id, r.item_key
having count(*) >= 5 and 100.0 * count(*) filter (where not r.done) / count(*) >= 80;

-- Estadísticas de tareas aprobadas (Anexo B)
create view v_approved_task_stats as
select building_id, date_trunc('month', performed_on)::date as period, trade,
       count(*) as total,
       avg(time_spent_minutes)::numeric(10,1) as avg_minutes,
       sum(coalesce(cost_amount,0))::numeric(14,2) as total_cost,
       round(100.0 * count(*) filter (where escalated) / count(*), 2) as escalation_pct
from approved_task_logs
group by building_id, date_trunc('month', performed_on), trade;
```

**Detección de tendencia de piscina (RN-47).** Se resuelve con funciones ventana sobre `pool_logs`: para cada parámetro, se comparan las tres últimas mediciones consecutivas; si las diferencias sucesivas tienen el mismo signo y la magnitud acumulada supera un umbral configurable, se emite un aviso. **Los días sin registro no se interpolan**: se computan como huecos y rompen la secuencia.

```sql
-- esqueleto: el signo consistente de las diferencias define la tendencia
select building_id, logged_on, free_chlorine,
       free_chlorine - lag(free_chlorine) over w  as delta_1,
       lag(free_chlorine) over w - lag(free_chlorine, 2) over w as delta_2
from pool_logs
window w as (partition by building_id order by logged_on);
```

---

## 3. Auditoría en la base de datos (no se puede saltear)

La aplicación declara quién está actuando; la base registra qué cambió.

```sql
create or replace function fn_audit() returns trigger language plpgsql as $$
declare
  v_actor uuid := nullif(current_setting('app.user_id', true), '')::uuid;
  v_role  text := nullif(current_setting('app.user_role', true), '');
  v_req   text := nullif(current_setting('app.request_id', true), '');
  v_before jsonb; v_after jsonb; v_changed text[];
begin
  if (tg_op = 'DELETE') then
    v_before := to_jsonb(old); v_after := null;
  elsif (tg_op = 'UPDATE') then
    v_before := to_jsonb(old); v_after := to_jsonb(new);
    select array_agg(key) into v_changed
      from jsonb_each(v_after) where v_after->key is distinct from v_before->key;
    if v_changed is null or cardinality(v_changed) = 0 then return new; end if;
  else
    v_before := null; v_after := to_jsonb(new);
  end if;

  insert into audit_log (building_id, actor_user_id, actor_role, entity_type,
                         entity_id, action, before, after, changed_fields, request_id)
  values (
    coalesce((v_after->>'building_id')::uuid, (v_before->>'building_id')::uuid),
    v_actor, v_role, tg_table_name,
    coalesce((v_after->>'id')::uuid, (v_before->>'id')::uuid),
    tg_op, v_before, v_after, v_changed, v_req
  );
  return coalesce(new, old);
end $$;

-- Aplicar a toda tabla auditable
create trigger trg_audit after insert or update or delete on tickets
  for each row execute function fn_audit();
-- …repetir para: cases, quotes, approvals, work_orders, invoices, assets,
--    maintenance_tasks, vendors, units, unit_occupancies, parties, documents,
--    decisions, memberships, governance_rules, monthly_reports

-- audit_log es inmutable
create rule audit_log_no_update as on update to audit_log do instead nothing;
create rule audit_log_no_delete as on delete to audit_log do instead nothing;
```

**Contrato de la aplicación:** toda transacción que escriba debe abrir con

```sql
SET LOCAL app.user_id    = '<uuid>';
SET LOCAL app.user_role  = '<role>';
SET LOCAL app.request_id = '<request-id>';
```

Implementarlo en un único helper `withTx(ctx, fn)` que nadie pueda evitar. **Ninguna escritura fuera de `withTx`.**

---

## 4. Autenticación y autorización

### 4.1. Flujo

1. El cliente se autentica con Firebase Auth y obtiene un **ID token**.
2. Lo envía en `Authorization: Bearer <token>`.
3. El servidor lo verifica con `firebase-admin` (`verifyIdToken`), con caché corta de claves públicas.
4. Se resuelve `users` por `firebase_uid`; si no existe y el email coincide con un `parties.email` invitado, se crea el usuario y su `membership`.
5. Se arma el `AuthContext`.

```ts
type AuthContext = {
  user: { id: string; email: string; displayName?: string };
  buildingId: string;
  roles: AppRole[];
  partyId?: string;
  unitIds: string[];       // unidades del usuario (para owner/tenant)
  requestId: string;
};
```

### 4.2. Capa de política

Una sola función, usada en **todos** los endpoints:

```ts
can(ctx: AuthContext, action: Action, subject: Subject, resource?: unknown): boolean
// Action:  'read' | 'create' | 'update' | 'delete' | 'approve' | 'export'
// Subject: 'ticket' | 'case' | 'asset' | 'quote' | 'invoice' | 'document' | ...
```

Matriz base (ver PRD §E8). Reglas específicas a implementar:

- `owner` / `tenant`: `read` de `ticket` solo si `ticket.unit_id ∈ ctx.unitIds` **o** el ticket es de área común y su `visibility` lo permite.
- `owner`: nunca ve `ticket_comments.is_internal = true`.
- `tenant`: no ve datos financieros ni de titularidad del propietario.
- `encargado`: `create/update` sobre operación; nunca `approve`.
- `administrador`: `approve` solo por debajo del umbral de `governance_rules`.
- `comision`: `approve` por encima del umbral.
- `contador`: `read` financiero + `export`; sin escritura.
- Todo `read` filtra por `building_id = ctx.buildingId`. **Sin excepción.**

### 4.3. Regla de gobernanza (motor)

Antes de emitir una `work_order`:

```ts
assertGovernance({
  caseId, amount, currency,
  quotes: Quote[],            // presupuestos del caso
  approverRole,
}): void | throws GovernanceError
```

- Busca la `governance_rule` activa cuyo `threshold_amount` sea el mayor ≤ monto.
- Verifica `quotes.length >= rule.min_quotes` y que exista `approval` de `rule.required_approver_role`.
- Si no se cumple, lanza `GovernanceError` con el requisito faltante (mensaje mostrado en la UI).
- Se puede omitir con `is_exception = true` + `exception_reason` obligatorio, y solo por `administrador` o `comision`. Genera `case_event` de tipo `governance_exception` visible en la línea de tiempo.

---

## 5. API

Route Handlers de Next.js bajo `/api`, REST, validación con zod, respuestas con envelope uniforme.

```
GET    /api/buildings/:bid/tickets?status=&priority=&unit=&assignee=&page=
POST   /api/buildings/:bid/tickets
PATCH  /api/buildings/:bid/tickets/:id
POST   /api/buildings/:bid/tickets/:id/comments
GET    /api/buildings/:bid/cases/:id            -- expediente + timeline
GET    /api/buildings/:bid/units/:id            -- ficha integral
GET    /api/buildings/:bid/assets
POST   /api/buildings/:bid/assets/:id/events
GET    /api/buildings/:bid/maintenance/tasks?due_before=&status=
POST   /api/buildings/:bid/maintenance/tasks/:id/complete
POST   /api/buildings/:bid/quotes
POST   /api/buildings/:bid/approvals
POST   /api/buildings/:bid/work-orders          -- valida governance
POST   /api/buildings/:bid/invoices
GET    /api/buildings/:bid/checklists/today
POST   /api/buildings/:bid/checklists/:id/items/:key
POST   /api/buildings/:bid/pool-logs
POST   /api/buildings/:bid/approved-tasks
POST   /api/buildings/:bid/incidents
POST   /api/buildings/:bid/stock-movements
GET    /api/buildings/:bid/reports/monthly/:period
POST   /api/buildings/:bid/reports/monthly/:period/submit
GET    /api/buildings/:bid/dashboard
GET    /api/buildings/:bid/compliance?period=day|week|month|season&from=&to=
GET    /api/buildings/:bid/compliance/me            -- indicador del encargado (RN-49)
GET    /api/buildings/:bid/analytics/pool-trends?param=&days=
GET    /api/buildings/:bid/analytics/omitted-items
GET    /api/buildings/:bid/analytics/approved-tasks?from=&to=
GET    /api/buildings/:bid/audit?entity=&from=&to=
POST   /api/buildings/:bid/documents/upload-url  -- signed URL v4
POST   /api/buildings/:bid/documents             -- confirma y crea vínculos
POST   /api/buildings/:bid/sync                  -- lote offline (ver §6)
GET    /api/buildings/:bid/exports/accounting?from=&to=&format=csv
```

**Envelope**

```jsonc
// éxito
{ "data": { /* ... */ }, "meta": { "page": 1, "total": 42 } }
// error
{ "error": { "code": "GOVERNANCE_RULE_UNMET", "message": "Faltan 2 presupuestos",
             "details": { "required": 3, "provided": 1 } } }
```

---

## 6. PWA del encargado — diseño offline

### 6.1. Principios

- **Optimista y local primero.** La UI escribe en IndexedDB y responde al instante; la red es un detalle.
- **Idempotencia por `client_uuid`.** El cliente genera un UUID v4 por mutación. El servidor usa `ON CONFLICT (client_uuid) DO NOTHING` y devuelve el registro existente. Reintentar nunca duplica.
- **Nada de escrituras que requieran leer el estado del servidor.** Las mutaciones offline son creaciones y actualizaciones simples, no transiciones que dependan del estado remoto.

### 6.2. Cola de sincronización

```ts
type QueuedMutation = {
  clientUuid: string;
  endpoint: string;
  method: 'POST' | 'PATCH';
  body: unknown;
  attempts: number;
  createdAt: number;
  status: 'pending' | 'syncing' | 'failed';
};
```

- Almacén: IndexedDB (`idb`), store `mutations` + store `cache` para lectura offline.
- Disparadores de sincronización: evento `online`, `visibilitychange`, Background Sync API, y un intento cada 60 s.
- Envío en lote a `POST /api/buildings/:bid/sync` con hasta 50 mutaciones; el servidor las procesa **en orden** y devuelve por `clientUuid` el resultado (`applied` | `duplicate` | `error`).
- Backoff exponencial con tope (1s, 2s, 4s… máx. 5 min). A los 10 intentos fallidos se marca `failed` y se muestra al usuario.
- **Las fotos** se suben aparte: se guardan como Blob en IndexedDB y se suben con signed URL al recuperar conexión; la mutación queda pendiente del `document_id`.

### 6.3. Indicadores en la UI

Barra de estado permanente: `Sin conexión · 3 registros pendientes`. Cada registro no sincronizado se muestra con un indicador propio. Nunca mentirle al usuario diciendo "guardado" si solo está encolado — decir **"guardado en el teléfono, pendiente de enviar"**.

### 6.4. Pantallas de la PWA (v1)

1. **Hoy** — checklist del día + tareas de mantenimiento que vencen + tickets asignados
2. **Nuevo ticket** — foto → categoría → descripción (con dictado) → enviar *(objetivo: ≤ 30 s)*
3. **Piscina** — planilla con validación de rangos
4. **Tareas aprobadas** — registro del Anexo B
5. **Incidente** — registro rápido
6. **Stock** — movimientos de insumos
7. **Mi informe** — vista previa del informe mensual en construcción

---

## 7. Jobs programados

| Job | Frecuencia | Qué hace |
|---|---|---|
| `generate-maintenance-tasks` | Diario 03:00 UY | Materializa tareas de `maintenance_plans` para la ventana de los próximos 60 días (idempotente por `unique (plan_id, due_date)`) |
| `flag-overdue` | Diario 04:00 UY | Marca `maintenance_tasks` y `tickets` vencidos; alimenta el tablero |
| `expiry-scan` | Diario 04:15 UY | Detecta documentos, seguros, garantías y contratos que vencen en 30/15/7 días → `outbox` |
| `compute-compliance` | Diario 20:00 UY | Calcula `compliance_snapshots` del día: ítems requeridos vs. completados, estado del día, registro de piscina si es temporada, y racha de días faltantes. Dispara las notificaciones de RN-44 y RN-45. **Idempotente** por `unique (building_id, snapshot_date)` |
| `detect-trends` | Diario 20:15 UY | Evalúa tendencias de piscina (RN-47) e ítems sistemáticamente omitidos (RN-46) → `outbox` |
| `generate-monthly-report` | Día 1, 05:00 UY | Arma `monthly_reports` del mes anterior con todos los agregados, **incluido el resumen de control de RN-50**; deja `status='draft'` |
| `dispatch-outbox` | Cada 5 min | Procesa `outbox` → email (Resend) / WhatsApp (n8n) |

Todos idempotentes y seguros ante reejecución.

---

## 8. Almacenamiento de archivos

- Bucket único por ambiente: `draga-{env}-documents`, acceso uniforme a nivel de bucket, **sin acceso público**.
- Convención de path: `buildings/{building_id}/{yyyy}/{uuid}-{slug}.{ext}`
- Subida: el cliente pide `POST /documents/upload-url` → el servidor valida permisos y devuelve una **signed URL v4** (PUT, 15 min, `content-type` fijado) → el cliente sube directo a GCS → confirma con `POST /documents` y se crean los `document_links`.
- Descarga: signed URL de lectura de 5 minutos, generada tras verificar `can(ctx,'read','document',doc)`.
- Límite 25 MB por archivo; imágenes redimensionadas en el cliente antes de subir (máx. 1920 px, JPEG q=0.8).

---

## 9. Estructura del repositorio

```
draga/
├─ app/
│  ├─ (admin)/…            # consola de administración
│  ├─ (owner)/…            # portal del propietario
│  ├─ (pwa)/…              # PWA del encargado
│  └─ api/…                # route handlers
├─ src/
│  ├─ auth/                # firebase-admin, AuthContext, middleware
│  ├─ policy/              # can(), matriz de permisos, governance engine
│  ├─ db/
│  │  ├─ schema/           # Drizzle (un archivo por dominio)
│  │  ├─ migrations/
│  │  └─ tx.ts             # withTx() ← única puerta de escritura
│  ├─ modules/             # casos de uso por dominio
│  │  ├─ cases/ tickets/ assets/ maintenance/ vendors/
│  │  ├─ procurement/ documents/ logbook/ reports/ dashboard/
│  ├─ sync/                # endpoint de lote + idempotencia
│  ├─ jobs/                # entry points de Cloud Run Jobs
│  ├─ notifications/       # outbox, plantillas, adapters
│  └─ shared/              # zod schemas, errores, utils
├─ public/                 # manifest, service worker, íconos
├─ tests/
│  ├─ unit/ integration/ e2e/
└─ infra/                  # Dockerfile, cloudbuild.yaml, terraform (opcional)
```

---

## 10. Requisitos no funcionales

| Aspecto | Requisito |
|---|---|
| **Rendimiento** | p95 de API < 400 ms; carga inicial de la PWA < 2 s en 3G simulada; bundle de la PWA < 250 KB gzip |
| **Disponibilidad** | Objetivo 99 % mensual. Cloud SQL con alta disponibilidad desactivada en v1 (costo); backups diarios con retención de 30 días y PITR de 7 días |
| **Seguridad** | HTTPS obligatorio; tokens verificados en cada request; sin secretos en el cliente; Secret Manager para credenciales; sin acceso público a buckets; rate limiting por IP y por usuario en endpoints de escritura |
| **Datos personales** | Uruguay, **Ley N.º 18.331** (URCDP). Definir base legal, finalidad, retención y derechos de acceso/rectificación. Las imágenes de cámaras y los datos de residentes requieren tratamiento explícito — **ver Q8 del PRD antes de la fase F4** |
| **Retención** | `audit_log` y `case_events` no se borran. Documentos según política a definir |
| **Accesibilidad** | Contraste AA; objetivos táctiles ≥ 44 px en la PWA; formularios usables con una sola mano |
| **Idioma** | Español rioplatense en toda la interfaz. Fechas `dd/mm/aaaa`, montos `$ 1.234,56`, zona `America/Montevideo` |
| **Observabilidad** | Cloud Logging estructurado con `request_id`; alertas por tasa de error > 2 % y por fallas del outbox |

---

## 11. Plan de implementación por PRs

Cada PR es una rama, se revisa en GitHub y debe quedar **desplegable y verde** por sí solo.

### Fase F1 — Cimientos y Encargado

| PR | Contenido | Criterio de cierre |
|---|---|---|
| **PR-01** | Scaffold: Next.js + TS + Drizzle + Docker + CI (lint, typecheck, test) + envs | `pnpm build` y CI en verde; deploy a Cloud Run de dev |
| **PR-02** | Esquema base (§2.1–2.3) + migraciones + seed de Draga Inn (unidades, coeficientes, áreas) | `pnpm db:migrate` y `db:seed` reproducibles desde cero |
| **PR-03** | Auth Firebase + `AuthContext` + `memberships` + `withTx()` + triggers de auditoría (§3) | Test: un UPDATE escribe `audit_log` con before/after correctos |
| **PR-04** | Capa de política `can()` + matriz de permisos + tests de autorización | Test: un `owner` no puede leer un ticket de otra unidad |
| **PR-05** | Expediente: `cases` + `case_events` + vista de línea de tiempo | Un ticket creado genera su `case` y su primer `case_event` |
| **PR-06** | Tickets: API + bandeja en consola + ciclo de estados + comentarios | Recorrido completo `new → closed` con auditoría |
| **PR-07** | PWA: shell, manifest, service worker, IndexedDB, cola de sync, `/api/sync` | Test e2e: crear ticket en modo avión, reconectar, se sincroniza una sola vez |
| **PR-08** | Planillas: checklists (plantillas del Manual), piscina, tareas aprobadas, incidentes, stock | Alta offline de los cinco tipos; piscina fuera de rango genera ticket crítico |

### Fase F2 — Administración

| PR | Contenido | Criterio de cierre |
|---|---|---|
| **PR-09** | Activos + planes de mantenimiento + job de generación de tareas | Plan mensual genera 12 tareas sin duplicar al reejecutar el job |
| **PR-10** | Proveedores + presupuestos + comparador | Tres presupuestos de un caso se ven lado a lado |
| **PR-11** | Aprobaciones + `governance_rules` + motor `assertGovernance` + excepción auditada | Emitir OT sin 3 presupuestos falla con `GOVERNANCE_RULE_UNMET`; con excepción queda registrada |
| **PR-12** | Órdenes de trabajo + conformidad + facturas (sin pago) | Expediente completo: ticket → 3 presupuestos → aprobación → OT → factura |
| **PR-13** | Documentos: signed URLs, `document_links` polimórficos, visibilidad | Un documento vinculado a activo y a proveedor aparece en ambas fichas |

### Fase F3 — Informe y tablero

| PR | Contenido | Criterio de cierre |
|---|---|---|
| **PR-14** | Informe mensual: job de generación + edición de narrativa + PDF | Informe del mes anterior generado el día 1 con todos los agregados |
| **PR-15** | Tablero: operación, gobernanza, riesgos, proveedores | Cada indicador navega al detalle filtrado |
| **PR-16** | Cumplimiento y análisis operativo: `compliance_snapshots`, vistas de §2.11, jobs `compute-compliance` y `detect-trends`, pantalla del encargado (§4.8) y consola (§5.11) | Un día sin registro dispara la notificación de RN-44; dos días consecutivos escalan al administrador; la serie de piscina muestra huecos sin interpolar |
| **PR-17** | Exportaciones para el contador (CSV/XLSX) + registro de decisiones (R19) | Export del mes abre correctamente en Excel |

### Fase F4 — Propietarios

| PR | Contenido | Criterio de cierre |
|---|---|---|
| **PR-18** | Portal: ficha de unidad, reclamos propios, alta de reclamo | Un propietario solo ve su unidad; no ve comentarios internos |
| **PR-19** | Documentos publicados + estado del edificio para propietarios | Solo documentos con `visibility ∈ (owners, public)` |
| **PR-20** | Notificaciones: outbox + email (Resend) + preferencias | Cambio de estado de ticket dispara email al reportante |
| **PR-21** | Hardening: rate limiting, observabilidad, backups verificados, carga de datos reales | Restauración de backup probada end-to-end |

---

## 12. Estrategia de pruebas

- **Unitarias (Vitest):** motor de gobernanza, `can()`, cálculo de rangos de piscina, agregados del informe mensual.
- **Integración:** contra Postgres real (Testcontainers o Cloud SQL de test). Obligatorio cubrir: triggers de auditoría, idempotencia de sync, exclusión de solapamiento en `unit_occupancies`, generación idempotente de tareas.
- **E2E (Playwright):** los tres recorridos críticos —
  1. Encargado crea ticket offline → sincroniza → el administrador lo ve
  2. Expediente completo con regla de gobernanza cumplida
  3. Propietario abre reclamo y ve el cambio de estado
- **Pruebas de autorización obligatorias:** por cada endpoint, un test negativo por cada rol que **no** debería poder ejecutarlo.

---

## 13. Datos iniciales (seed)

1. `buildings`: Edificio Draga Inn (timezone `America/Montevideo`, moneda `UYU`).
2. `units`: padrón real con coeficientes — **depende de Q5 del PRD**.
3. `parties` + `unit_occupancies`: propietarios e inquilinos vigentes.
4. `checklist_templates`: cargar **exactamente** el cronograma del Manual de Trabajo v1.5 — diarias (recorrida, iluminación, residuos, limpieza, piscina, parque, atención, cierre), semanales (lunes a sábado), mensuales (semanas 1–4), trimestrales y estacionales.
5. `budget_categories`: rubros básicos (mantenimiento, limpieza, piscina, parque, servicios, seguros, honorarios, obras).
6. `governance_rules`: umbral y aprobadores — **depende de Q2 y Q3 del PRD**.
7. `assets`: inventario inicial — **depende de Q7 del PRD**.
8. `stock_items`: insumos críticos del Anexo E del Manual.

---

## 14. Riesgos técnicos

| Riesgo | Mitigación |
|---|---|
| La cola offline duplica registros | `client_uuid` único + `ON CONFLICT DO NOTHING` + test e2e explícito de reintento |
| La auditoría se saltea desde algún código nuevo | Triggers en la base (no en la app) + `withTx()` como única puerta de escritura + lint rule que prohíba importar el pool directamente |
| Fuga de datos entre edificios al crecer a multi-edificio | `building_id` en toda tabla, scoping en el repositorio, y un test que recorra todos los endpoints con dos edificios sembrados |
| El v2 financiero obliga a migrar | `budget_category_id`, `cost_amount` y `currency` ya presentes en las tablas de hechos |
| Cloud SQL como punto único de falla | Backups diarios + PITR; evaluar HA cuando el piloto se valide |
| Costos de GCP mayores a lo previsto | Cloud Run con `min-instances=0` en dev; Cloud SQL en la instancia más chica; presupuesto con alerta |

---

## 15. Definición de terminado (v1)

- [ ] Los 21 PRs mergeados y desplegados en producción
- [ ] Encargado operando sin papel durante 30 días corridos
- [ ] Al menos un expediente completo punta a punta con regla de gobernanza aplicada
- [ ] Informe mensual generado automáticamente y aceptado por la Administración
- [ ] Al menos el 60 % de las unidades con un ingreso al portal
- [ ] `audit_log` con cobertura verificada sobre todas las tablas auditables
- [ ] Backup restaurado con éxito en un ambiente limpio
- [ ] Preguntas Q1–Q5 del PRD respondidas y reflejadas en configuración

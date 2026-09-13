/**
 * Seed del Edificio Draga Inn.
 *
 * Idempotente: se puede correr sobre una base recién migrada o sobre una ya
 * sembrada sin duplicar nada. Los datos de unidades, coeficientes, activos y
 * reglas de gobernanza son PROVISORIOS: dependen de Q2, Q3, Q5 y Q7 del PRD.
 * Están marcados como tales para que no se confundan con el padrón real.
 */
import { sql } from 'drizzle-orm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getPool } from './client';
import { withTx } from './tx';
import type { AuthContext } from '@/auth/context';
import { DEFAULT_POOL_RANGES } from '@/shared/pool';
import { ASSETS, BUDGET_CATEGORIES, CHECKLIST_TEMPLATES, MAINTENANCE_PLANS, STOCK_ITEMS } from './seed-data';

const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000001';
const BUILDING_ID = '11111111-1111-1111-1111-111111111111';

/** Padrón provisorio: 8 pisos × 4 unidades + cocheras y bauleras. Depende de Q5. */
function provisionalUnits() {
  const units: { code: string; unitType: 'apartment' | 'parking' | 'storage'; floor: string | null; coefficient: string }[] = [];
  const perFloor = ['01', '02', '03', '04'];
  const totalApts = 8 * perFloor.length;
  const coef = (100 / totalApts).toFixed(4);

  for (let floor = 1; floor <= 8; floor += 1) {
    for (const n of perFloor) units.push({ code: `${floor}${n}`, unitType: 'apartment', floor: String(floor), coefficient: coef });
  }
  for (let i = 1; i <= totalApts; i += 1) units.push({ code: `C-${String(i).padStart(2, '0')}`, unitType: 'parking', floor: 'SS', coefficient: '0.0000' });
  for (let i = 1; i <= 16; i += 1) units.push({ code: `B-${String(i).padStart(2, '0')}`, unitType: 'storage', floor: 'SS', coefficient: '0.0000' });
  return units;
}

export async function seed(): Promise<void> {
  const ctx: AuthContext = {
    user: { id: SYSTEM_USER_ID, email: 'sistema@dragainn.uy', displayName: 'Sistema' },
    buildingId: BUILDING_ID,
    buildingSettings: {},
    buildingTimezone: 'America/Montevideo',
    buildingCurrency: 'UYU',
    roles: ['administrador'],
    unitIds: [],
    requestId: 'seed',
  };

  await withTx(ctx, async (tx) => {
    // 1. Edificio. Todos los parámetros regulables viven acá, no en el código.
    await tx.execute(sql`
      insert into buildings (id, name, legal_name, address, city, department, country, timezone, currency, settings)
      values (${BUILDING_ID}, 'Edificio Draga Inn', 'Edificio Draga Inn — Propiedad Horizontal',
              'Punta del Este', 'Punta del Este', 'Maldonado', 'UY', 'America/Montevideo', 'UYU',
              ${JSON.stringify({
                season: { highFrom: '12-01', highTo: '03-31' },
                pool: DEFAULT_POOL_RANGES,
                invoiceTolerancePct: 10,
                ticketAutoCloseDays: 7,
                ticketReopenDays: 7,
                dailyCutoffHour: 20,
                backdateGraceDays: 7,
                omittedItemThresholdPct: 80,
                approvedTaskCostEnabled: true,
              })}::jsonb)
      on conflict (id) do update set settings = excluded.settings, updated_at = now()`);

    // 2. Usuario del sistema: actor de los jobs, para que la auditoría nunca quede sin autor.
    await tx.execute(sql`
      insert into users (id, firebase_uid, email, display_name, is_active)
      values (${SYSTEM_USER_ID}, 'system', 'sistema@dragainn.uy', 'Sistema', true)
      on conflict (id) do nothing`);
    await tx.execute(sql`
      insert into memberships (user_id, building_id, role)
      values (${SYSTEM_USER_ID}, ${BUILDING_ID}, 'administrador')
      on conflict do nothing`);

    // 3. Sector y áreas comunes
    await tx.execute(sql`
      insert into sectors (building_id, name, kind) values (${BUILDING_ID}, 'Torre única', 'tower')
      on conflict do nothing`);
    for (const [name, kind, bookable] of [
      ['Piscina', 'piscina', false], ['Parrillero', 'parrillero', true],
      ['SUM', 'sum', true], ['Parque', 'parque', false],
      ['Hall de acceso', 'hall', false], ['Cocheras', 'cochera', false],
    ] as const) {
      await tx.execute(sql`
        insert into common_areas (building_id, name, kind, bookable)
        select ${BUILDING_ID}, ${name}, ${kind}, ${bookable}
        where not exists (select 1 from common_areas where building_id = ${BUILDING_ID} and name = ${name})`);
    }

    // 4. Unidades (PROVISORIO — depende de Q5 del PRD)
    for (const u of provisionalUnits()) {
      await tx.execute(sql`
        insert into units (building_id, code, unit_type, floor, coefficient, notes, created_by)
        values (${BUILDING_ID}, ${u.code}, ${u.unitType}::unit_type, ${u.floor}, ${u.coefficient},
                'Padrón provisorio del seed. Reemplazar con el padrón real (Q5 del PRD).', ${SYSTEM_USER_ID})
        on conflict (building_id, code) do nothing`);
    }

    // 5. Rubros presupuestales
    for (const c of BUDGET_CATEGORIES) {
      await tx.execute(sql`
        insert into budget_categories (building_id, code, name, created_by)
        values (${BUILDING_ID}, ${c.code}, ${c.name}, ${SYSTEM_USER_ID})
        on conflict (building_id, code) do nothing`);
    }

    // 6. Reglas de gobernanza (PROVISORIO — depende de Q2 y Q3 del PRD)
    for (const r of [
      { name: 'Gasto menor', threshold: '0.00', minQuotes: 1, role: 'administrador' },
      { name: 'Gasto medio', threshold: '30000.00', minQuotes: 2, role: 'administrador' },
      { name: 'Gasto mayor', threshold: '150000.00', minQuotes: 3, role: 'comision' },
    ]) {
      await tx.execute(sql`
        insert into governance_rules (building_id, name, threshold_amount, currency, min_quotes, required_approver_role, created_by)
        select ${BUILDING_ID}, ${r.name}, ${r.threshold}, 'UYU', ${r.minQuotes}, ${r.role}::app_role, ${SYSTEM_USER_ID}
        where not exists (select 1 from governance_rules where building_id = ${BUILDING_ID} and name = ${r.name})`);
    }

    // 7. Plantillas de checklist — cronograma del Manual de Trabajo v1.5
    for (const t of CHECKLIST_TEMPLATES) {
      await tx.execute(sql`
        insert into checklist_templates (building_id, name, freq, seasonal, items, created_by)
        select ${BUILDING_ID}, ${t.name}, ${t.freq}::frequency, ${t.seasonal ?? false},
               ${JSON.stringify(t.items)}::jsonb, ${SYSTEM_USER_ID}
        where not exists (select 1 from checklist_templates where building_id = ${BUILDING_ID} and name = ${t.name})`);
    }

    // 8. Activos (PROVISORIO — depende de Q7 del PRD)
    for (const a of ASSETS) {
      await tx.execute(sql`
        insert into assets (building_id, name, category, location, criticality, created_by)
        select ${BUILDING_ID}, ${a.name}, ${a.category}, ${a.location}, ${a.criticality}::criticality, ${SYSTEM_USER_ID}
        where not exists (select 1 from assets where building_id = ${BUILDING_ID} and name = ${a.name})`);
    }

    // 9. Planes preventivos
    for (const p of MAINTENANCE_PLANS) {
      await tx.execute(sql`
        insert into maintenance_plans (building_id, asset_id, name, freq, interval_count, start_date, created_by)
        select ${BUILDING_ID}, a.id, ${p.name}, ${p.freq}::frequency, ${p.intervalCount}, current_date, ${SYSTEM_USER_ID}
          from assets a
         where a.building_id = ${BUILDING_ID} and a.name = ${p.assetName}
           and not exists (select 1 from maintenance_plans where building_id = ${BUILDING_ID} and name = ${p.name})`);
    }

    // 10. Insumos del Anexo E
    for (const s of STOCK_ITEMS) {
      await tx.execute(sql`
        insert into stock_items (building_id, name, unit_of_measure, min_quantity, current_quantity, created_by)
        select ${BUILDING_ID}, ${s.name}, ${s.unitOfMeasure}, ${s.minQuantity}, ${s.currentQuantity}, ${SYSTEM_USER_ID}
        where not exists (select 1 from stock_items where building_id = ${BUILDING_ID} and name = ${s.name})`);
    }
  });

  process.stdout.write(`✔ Seed aplicado. building_id = ${BUILDING_ID}\n`);
  process.stdout.write('  Datos provisorios: unidades (Q5), reglas de gobernanza (Q2/Q3), activos (Q7).\n');
  process.stdout.write('  Invitá al primer administrador real antes de usarlo en producción:\n');
  process.stdout.write(`  insert into invitations (building_id, email, role) values ('${BUILDING_ID}', 'tu@email', 'administrador');\n`);
}

const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isDirectRun) {
  seed()
    .then(() => getPool().end())
    .then(() => process.exit(0))
    .catch((err: Error) => {
      process.stderr.write(`✖ ${err.message}\n`);
      process.exit(1);
    });
}

export { BUILDING_ID, SYSTEM_USER_ID };

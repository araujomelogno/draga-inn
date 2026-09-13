import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { withTx, withRead, type Tx } from '@/db/tx';
import { memberships, users } from '@/db/schema';
import type { AppRole, AuthContext } from '@/auth/context';
import { BUILDING_ID } from '@/db/seed';

export const HAY_BASE = Boolean(process.env.DATABASE_URL);
export { BUILDING_ID };

/**
 * La base la prepara `global-setup.ts` una sola vez por corrida: acá solo
 * verificamos que esté disponible.
 */
export async function prepararBase(): Promise<void> {
  if (!HAY_BASE) throw new Error('Falta DATABASE_URL para los tests de integración.');
}

/** Crea un usuario real con sus roles, para que la auditoría tenga autor. */
export async function crearUsuario(roles: AppRole[], nombre = 'Prueba'): Promise<AuthContext> {
  const ctxBootstrap = sistema();
  const user = await withTx(ctxBootstrap, async (tx) => {
    const [u] = await tx.insert(users).values({
      firebaseUid: `test-${randomUUID()}`,
      email: `${randomUUID().slice(0, 8)}@dragainn.test`,
      displayName: nombre,
    }).returning();
    await tx.insert(memberships).values(roles.map((role) => ({ userId: u!.id, buildingId: BUILDING_ID, role })));
    return u!;
  });

  return {
    user: { id: user.id, email: user.email, displayName: nombre },
    buildingId: BUILDING_ID,
    buildingSettings: { invoiceTolerancePct: 10, ticketAutoCloseDays: 7, ticketReopenDays: 7 },
    buildingTimezone: 'America/Montevideo',
    buildingCurrency: 'UYU',
    roles,
    unitIds: [],
    requestId: randomUUID(),
  };
}

export function sistema(): AuthContext {
  return {
    user: { id: '00000000-0000-0000-0000-000000000001', email: 'sistema@dragainn.uy', displayName: 'Sistema' },
    buildingId: BUILDING_ID,
    buildingSettings: {},
    buildingTimezone: 'America/Montevideo',
    buildingCurrency: 'UYU',
    roles: ['administrador'],
    unitIds: [],
    requestId: randomUUID(),
  };
}

export async function unaUnidad(): Promise<{ id: string; code: string }> {
  return withRead(async (db) => {
    const { rows } = await db.execute(sql`select id, code from units where building_id = ${BUILDING_ID} and unit_type = 'apartment' order by code limit 1`);
    return rows[0] as { id: string; code: string };
  });
}

export async function unProveedor(tx: Tx): Promise<string> {
  const { rows } = await tx.execute(sql`
    insert into vendors (building_id, legal_name, status)
    values (${BUILDING_ID}, ${'Proveedor ' + randomUUID().slice(0, 6)}, 'active')
    returning id`);
  return (rows[0] as { id: string }).id;
}

export async function auditoriaDe(entidad: string, id: string) {
  return withRead(async (db) => {
    const { rows } = await db.execute(sql`
      select action, changed_fields, actor_user_id, actor_role, request_id, before, after
        from audit_log where entity_type = ${entidad} and entity_id = ${id}::uuid
       order by id`);
    return rows as {
      action: string; changed_fields: string[] | null; actor_user_id: string | null;
      actor_role: string | null; request_id: string | null;
      before: Record<string, unknown> | null; after: Record<string, unknown> | null;
    }[];
  });
}

export { eq, sql, withTx, withRead };

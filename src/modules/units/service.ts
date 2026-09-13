import { and, asc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Tx } from '@/db/tx';
import type { AuthContext } from '@/auth/context';
import { parties, units } from '@/db/schema';
import { assertCan, can } from '@/policy/can';
import { ForbiddenError, NotFoundError, ValidationError } from '@/shared/errors';
import { occupancySchema } from '@/shared/schemas';
import { localDate } from '@/shared/dates';

/** ESPEC §5.5 — Listado con titular vigente y reclamos abiertos. */
export async function listUnits(tx: Tx, ctx: AuthContext) {
  assertCan(ctx, 'read', 'unit_other');
  const { rows } = await tx.execute(sql`
    select u.id, u.code, u.unit_type, u.floor, u.coefficient, u.area_m2,
           o.full_name  as owner_name,  o.party_id as owner_party_id,
           t.full_name  as tenant_name, t.party_id as tenant_party_id,
           coalesce(k.open_tickets, 0)::int as open_tickets,
           (o.party_id is null) as incomplete
      from units u
      left join lateral (
        select p.full_name, uo.party_id from unit_occupancies uo
          join parties p on p.id = uo.party_id
         where uo.unit_id = u.id and uo.role = 'owner' and uo.is_primary
           and current_date <@ uo.period limit 1) o on true
      left join lateral (
        select p.full_name, uo.party_id from unit_occupancies uo
          join parties p on p.id = uo.party_id
         where uo.unit_id = u.id and uo.role = 'tenant' and uo.is_primary
           and current_date <@ uo.period limit 1) t on true
      left join lateral (
        select count(*) as open_tickets from tickets tk
         where tk.unit_id = u.id and tk.status <> 'closed') k on true
     where u.building_id = ${ctx.buildingId}
     order by u.code
  `);
  return rows;
}

/**
 * Ficha integral de la unidad.
 * CB-05: el nuevo propietario ve los reclamos abiertos, no el histórico del anterior.
 */
export async function unitDetail(tx: Tx, ctx: AuthContext, unitId: string, asOf?: string) {
  const [unit] = await tx.select().from(units)
    .where(and(eq(units.id, unitId), eq(units.buildingId, ctx.buildingId))).limit(1);
  if (!unit) throw new NotFoundError('No encontramos la unidad.');

  const isStaff = can(ctx, 'read', 'unit_other');
  if (!isStaff && !ctx.unitIds.includes(unitId)) throw new ForbiddenError();

  const date = asOf ?? localDate(new Date(), ctx.buildingTimezone);

  // "Ver a fecha": quién era propietario e inquilino en esa fecha (RN-03).
  const { rows: occupants } = await tx.execute(sql`
    select uo.id, uo.role, uo.is_primary, uo.period, p.id as party_id, p.full_name,
           ${isStaff ? sql`p.email` : sql`null::text`} as email,
           ${isStaff ? sql`p.phone` : sql`null::text`} as phone,
           lower(uo.period) as from_date, upper(uo.period) as to_date,
           (${date}::date <@ uo.period) as current
      from unit_occupancies uo join parties p on p.id = uo.party_id
     where uo.unit_id = ${unitId} and uo.building_id = ${ctx.buildingId}
     order by lower(uo.period) desc
  `);

  // El inquilino no ve los datos del propietario.
  const isTenantOnly = ctx.roles.includes('tenant') && !ctx.roles.includes('owner') && !isStaff;
  const visibleOccupants = isTenantOnly
    ? (occupants as Record<string, unknown>[]).filter((o) => o.role !== 'owner')
    : occupants;

  // CB-05: el ocupante actual solo ve tickets abiertos o los que él reportó.
  const ticketScope = isStaff
    ? sql`true`
    : sql`(tk.status <> 'closed' or tk.reported_by_user_id = ${ctx.user.id})`;

  const { rows: unitTickets } = await tx.execute(sql`
    select tk.id, tk.number, tk.title, tk.status, tk.priority, tk.created_at, tk.category
      from tickets tk
     where tk.unit_id = ${unitId} and tk.building_id = ${ctx.buildingId} and ${ticketScope}
     order by tk.created_at desc limit 100
  `);

  const { rows: children } = await tx.execute(sql`
    select id, code, unit_type from units where parent_unit_id = ${unitId}
  `);

  const { rows: docs } = await tx.execute(sql`
    select d.id, d.title, d.doc_type, d.issued_on, d.expires_on, d.visibility
      from documents d join document_links dl on dl.document_id = d.id
     where dl.entity_type = 'unit' and dl.entity_id = ${unitId}
       and d.building_id = ${ctx.buildingId}
       ${isStaff ? sql`` : sql`and d.visibility in ('owners','public')`}
     order by d.created_at desc
  `);

  return {
    unit,
    asOf: date,
    occupants: visibleOccupants,
    tickets: unitTickets,
    // Cochera y baulera vinculadas a la unidad.
    children,
    documents: docs,
    // CB-12: unidad sin propietario vigente queda marcada como incompleta.
    incomplete: !(occupants as { role: string; current: boolean }[]).some((o) => o.role === 'owner' && o.current),
  };
}

/**
 * RN-03 — Cambio de titularidad. Nunca se sobrescribe: se cierra el período
 * anterior con la fecha indicada y se abre uno nuevo. La exclusión GiST de la
 * base impide que queden dos titulares principales solapados.
 */
export async function changeOwnership(tx: Tx, ctx: AuthContext, input: z.infer<typeof occupancySchema>) {
  assertCan(ctx, 'create', 'occupancy');

  const [unit] = await tx.select().from(units)
    .where(and(eq(units.id, input.unitId), eq(units.buildingId, ctx.buildingId))).limit(1);
  if (!unit) throw new NotFoundError('No encontramos la unidad.');

  const [party] = await tx.select().from(parties)
    .where(and(eq(parties.id, input.partyId), eq(parties.buildingId, ctx.buildingId))).limit(1);
  if (!party) throw new NotFoundError('No encontramos a la persona.');

  if (input.to && input.to <= input.from) {
    throw new ValidationError('La fecha de fin tiene que ser posterior a la de inicio.');
  }

  if (input.isPrimary) {
    // Cerrar el período vigente en la fecha de inicio del nuevo. Nunca borrarlo.
    await tx.execute(sql`
      update unit_occupancies
         set period = daterange(lower(period), ${input.from}::date, '[)')
       where unit_id = ${input.unitId} and building_id = ${ctx.buildingId}
         and role = ${input.role}::occupancy_role and is_primary
         and upper_inf(period) and lower(period) < ${input.from}::date
    `);
  }

  const { rows } = await tx.execute(sql`
    insert into unit_occupancies (building_id, unit_id, party_id, role, period, is_primary, created_by)
    values (${ctx.buildingId}, ${input.unitId}, ${input.partyId}, ${input.role}::occupancy_role,
            daterange(${input.from}::date, ${input.to ?? null}::date, '[)'), ${input.isPrimary}, ${ctx.user.id})
    returning id, period
  `);
  return rows[0];
}

export async function listParties(tx: Tx, ctx: AuthContext) {
  assertCan(ctx, 'read', 'party');
  return tx.select().from(parties).where(eq(parties.buildingId, ctx.buildingId)).orderBy(asc(parties.fullName));
}

/** Reclamos del propietario logueado, para el portal. */
export async function myTickets(tx: Tx, ctx: AuthContext) {
  const { rows } = await tx.execute(sql`
    select tk.id, tk.number, tk.title, tk.status, tk.priority, tk.category,
           tk.created_at, tk.resolved_at, u.code as unit_code
      from tickets tk left join units u on u.id = tk.unit_id
     where tk.building_id = ${ctx.buildingId}
       and (tk.reported_by_user_id = ${ctx.user.id}
            or tk.unit_id = any(${sql.param(ctx.unitIds)}::uuid[]))
     order by tk.created_at desc limit 200
  `);
  return rows;
}

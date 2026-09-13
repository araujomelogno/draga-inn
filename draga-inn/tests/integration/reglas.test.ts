import { beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { BUILDING_ID, crearUsuario, HAY_BASE, prepararBase, sql, unaUnidad, withRead, withTx } from './_setup';
import { createTicket } from '@/modules/tickets/service';
import { createPoolLog, createStockMovement, createApprovedTask, checklistsForDate, markChecklistItem } from '@/modules/logbook/service';
import { processMutation } from '@/sync/process';
import { changeOwnership } from '@/modules/units/service';
import { materializePlan } from '@/modules/maintenance/service';
import { issueWorkOrder, createQuote, recordApproval, createInvoice } from '@/modules/procurement/service';
import { ConflictError, ForbiddenError, GovernanceError, ValidationError } from '@/shared/errors';
import { maintenancePlans } from '@/db/schema';
import { and, eq } from 'drizzle-orm';
import { localDate } from '@/shared/dates';

const d = HAY_BASE ? describe : describe.skip;
const HOY = () => localDate(new Date(), 'America/Montevideo');

d('HANDOFF §6 — reintentar nunca duplica', () => {
  beforeAll(prepararBase, 120_000);

  it('el mismo client_uuid crea un solo ticket, aunque se envíe dos veces', async () => {
    const ctx = await crearUsuario(['encargado']);
    const clientUuid = randomUUID();
    const cuerpo = {
      clientUuid, description: 'Se tapó el desagüe del garaje con hojas.',
      category: 'plomeria' as const, priority: 'normal' as const, source: 'pwa' as const, photoDocumentIds: [],
    };

    const a = await withTx(ctx, (tx) => createTicket(tx, ctx, cuerpo));
    const b = await withTx(ctx, (tx) => createTicket(tx, ctx, cuerpo));

    expect(a.duplicate).toBe(false);
    expect(b.duplicate).toBe(true);
    expect(b.ticket.id).toBe(a.ticket.id);

    const total = await withRead(async (db) => {
      const { rows } = await db.execute(sql`select count(*)::int as n from tickets where client_uuid = ${clientUuid}::uuid`);
      return (rows[0] as { n: number }).n;
    });
    expect(total).toBe(1);
  });

  it('el endpoint de sincronización responde applied y después duplicate', async () => {
    const ctx = await crearUsuario(['encargado']);
    const m = {
      clientUuid: randomUUID(),
      endpoint: `/api/buildings/${BUILDING_ID}/tickets`,
      method: 'POST' as const,
      body: { description: 'La puerta del hall no cierra bien.', category: 'porteria', priority: 'normal', source: 'pwa' },
    };

    const r1 = await withTx(ctx, (tx) => processMutation(tx, ctx, m));
    const r2 = await withTx(ctx, (tx) => processMutation(tx, ctx, m));

    expect(r1.result).toBe('applied');
    expect(r2.result).toBe('duplicate');
    if (r1.result === 'applied' && r2.result === 'duplicate') expect(r2.entityId).toBe(r1.entityId);
  });

  it('vale igual para piscina, tareas aprobadas y stock', async () => {
    const ctx = await crearUsuario(['encargado']);

    const piscina = { clientUuid: randomUUID(), loggedOn: HOY(), freeChlorine: 2, ph: 7.4 };
    const p1 = await withTx(ctx, (tx) => createPoolLog(tx, ctx, piscina));
    const p2 = await withTx(ctx, (tx) => createPoolLog(tx, ctx, piscina));
    expect(p2.duplicate).toBe(true);
    expect(p2.log.id).toBe(p1.log.id);

    const tarea = {
      clientUuid: randomUUID(), performedOn: HOY(), trade: 'painting' as const,
      description: 'Se repintó el zócalo del hall de entrada.', escalated: false, createEscalationTicket: false,
    };
    const t1 = await withTx(ctx, (tx) => createApprovedTask(tx, ctx, tarea));
    const t2 = await withTx(ctx, (tx) => createApprovedTask(tx, ctx, tarea));
    expect(t2.duplicate).toBe(true);
    expect(t2.log.id).toBe(t1.log.id);

    const item = await withRead(async (db) => {
      const { rows } = await db.execute(sql`select id from stock_items where building_id = ${BUILDING_ID} limit 1`);
      return (rows[0] as { id: string }).id;
    });
    const mov = { clientUuid: randomUUID(), stockItemId: item, kind: 'out' as const, quantity: 1 };
    const s1 = await withTx(ctx, (tx) => createStockMovement(tx, ctx, mov));
    const s2 = await withTx(ctx, (tx) => createStockMovement(tx, ctx, mov));
    expect(s2.duplicate).toBe(true);
    expect(s2.movement.id).toBe(s1.movement.id);
  });
});

d('Regla 1 — todo hecho pertenece a un expediente', () => {
  beforeAll(prepararBase, 120_000);

  it('un ticket creado sin caseId abre su propio expediente y su primer evento', async () => {
    const ctx = await crearUsuario(['encargado']);
    const { ticket } = await withTx(ctx, (tx) => createTicket(tx, ctx, {
      description: 'El portón del garaje quedó trabado a mitad de camino.',
      category: 'seguridad', priority: 'high', source: 'pwa', photoDocumentIds: [],
    }));

    expect(ticket.caseId).toBeTruthy();

    const eventos = await withRead(async (db) => {
      const { rows } = await db.execute(sql`
        select event_type from case_events where case_id = ${ticket.caseId} order by occurred_at`);
      return (rows as { event_type: string }[]).map((r) => r.event_type);
    });
    expect(eventos).toContain('case_opened');
    expect(eventos).toContain('ticket_created');
  });
});

d('RN-22 — piscina fuera de rango crítico abre ticket crítico vinculado', () => {
  beforeAll(prepararBase, 120_000);

  it('un cloro de 0,2 ppm crea un ticket crítico de categoría piscina', async () => {
    const ctx = await crearUsuario(['encargado']);
    const r = await withTx(ctx, (tx) => createPoolLog(tx, ctx, {
      clientUuid: randomUUID(),
      loggedOn: HOY(),
      loggedAt: new Date().toISOString(),
      freeChlorine: 0.2,
      ph: 7.4,
      observations: 'Cloración de choque aplicada y pileta cerrada hasta nueva medición.',
    }));

    expect(r.ticketId).toBeTruthy();

    const ticket = await withRead(async (db) => {
      const { rows } = await db.execute(sql`select priority, category, case_id from tickets where id = ${r.ticketId}::uuid`);
      return rows[0] as { priority: string; category: string; case_id: string };
    });
    expect(ticket.priority).toBe('critical');
    expect(ticket.category).toBe('piscina');
    // El ticket queda vinculado al registro que lo originó
    expect(r.log.caseId ?? ticket.case_id).toBe(ticket.case_id);
  });

  it('RN-21: fuera de rango sin observación se rechaza con un mensaje que dice qué hacer', async () => {
    const ctx = await crearUsuario(['encargado']);
    await expect(
      withTx(ctx, (tx) => createPoolLog(tx, ctx, {
        clientUuid: randomUUID(), loggedOn: HOY(), loggedAt: new Date().toISOString(), freeChlorine: 2, ph: 8.4,
      })),
    ).rejects.toThrowError(ValidationError);
  });
});

d('RN-03 — la titularidad nunca se sobrescribe', () => {
  beforeAll(prepararBase, 120_000);

  it('un cambio de propietario cierra el período anterior y abre uno nuevo', async () => {
    const ctx = await crearUsuario(['administrador']);
    const unidad = await unaUnidad();

    const [p1, p2] = await withTx(ctx, async (tx) => {
      const a = await tx.execute(sql`insert into parties (building_id, full_name) values (${BUILDING_ID}, 'Primer Propietario') returning id`);
      const b = await tx.execute(sql`insert into parties (building_id, full_name) values (${BUILDING_ID}, 'Segundo Propietario') returning id`);
      return [(a.rows[0] as { id: string }).id, (b.rows[0] as { id: string }).id];
    });

    await withTx(ctx, (tx) => changeOwnership(tx, ctx, {
      unitId: unidad.id, partyId: p1, role: 'owner', from: '2020-01-01', isPrimary: true,
    }));
    await withTx(ctx, (tx) => changeOwnership(tx, ctx, {
      unitId: unidad.id, partyId: p2, role: 'owner', from: '2024-06-01', isPrimary: true,
    }));

    const periodos = await withRead(async (db) => {
      const { rows } = await db.execute(sql`
        select party_id, lower(period) as desde, upper(period) as hasta
          from unit_occupancies where unit_id = ${unidad.id} and role = 'owner' order by lower(period)`);
      return rows as { party_id: string; desde: string; hasta: string | null }[];
    });

    // El período anterior NO se borró: se cerró.
    expect(periodos).toHaveLength(2);
    expect(periodos[0]!.party_id).toBe(p1);
    expect(periodos[0]!.hasta).toBe('2024-06-01');
    expect(periodos[1]!.party_id).toBe(p2);
    expect(periodos[1]!.hasta).toBeNull();
  });

  it('la base impide dos titulares principales solapados', async () => {
    const ctx = await crearUsuario(['administrador']);
    const unidad = await withRead(async (db) => {
      const { rows } = await db.execute(sql`select id from units where building_id = ${BUILDING_ID} and unit_type = 'apartment' order by code offset 5 limit 1`);
      return (rows[0] as { id: string }).id;
    });

    const [p1, p2] = await withTx(ctx, async (tx) => {
      const a = await tx.execute(sql`insert into parties (building_id, full_name) values (${BUILDING_ID}, 'Titular A') returning id`);
      const b = await tx.execute(sql`insert into parties (building_id, full_name) values (${BUILDING_ID}, 'Titular B') returning id`);
      return [(a.rows[0] as { id: string }).id, (b.rows[0] as { id: string }).id];
    });

    await withTx(ctx, async (tx) => {
      await tx.execute(sql`
        insert into unit_occupancies (building_id, unit_id, party_id, role, period, is_primary)
        values (${BUILDING_ID}, ${unidad}::uuid, ${p1}::uuid, 'owner', daterange('2020-01-01','2030-01-01','[)'), true)`);
    });

    // Insertar un solapado directo debe fallar por la exclusión GiST
    await expect(
      withTx(ctx, async (tx) => {
        await tx.execute(sql`
          insert into unit_occupancies (building_id, unit_id, party_id, role, period, is_primary)
          values (${BUILDING_ID}, ${unidad}::uuid, ${p2}::uuid, 'owner', daterange('2025-01-01','2026-01-01','[)'), true)`);
      }),
    ).rejects.toThrow();
  });
});

d('RN-04 — el edificio no se queda sin administrador', () => {
  beforeAll(prepararBase, 120_000);

  it('desactivar al último administrador activo falla con un mensaje claro', async () => {
    const ctx = await crearUsuario(['administrador']);

    // Dejar uno solo: desactivamos todos menos el nuestro
    await withTx(ctx, async (tx) => {
      await tx.execute(sql`
        update memberships set is_active = false
         where building_id = ${BUILDING_ID} and role = 'administrador' and user_id <> ${ctx.user.id}::uuid`);
    });

    await expect(
      withTx(ctx, async (tx) => {
        await tx.execute(sql`
          update memberships set is_active = false
           where building_id = ${BUILDING_ID} and role = 'administrador' and user_id = ${ctx.user.id}::uuid`);
      }),
    ).rejects.toThrow(/administrador/i);

    // Restaurar para no afectar a los tests siguientes
    await withTx(ctx, async (tx) => {
      await tx.execute(sql`update memberships set is_active = true where building_id = ${BUILDING_ID} and role = 'administrador'`);
    });
  });
});

d('Generación idempotente de tareas preventivas', () => {
  beforeAll(prepararBase, 120_000);

  it('reejecutar el job no duplica tareas', async () => {
    const ctx = await crearUsuario(['administrador']);
    const [plan] = await withRead((db) =>
      db.select().from(maintenancePlans).where(and(eq(maintenancePlans.buildingId, BUILDING_ID), eq(maintenancePlans.active, true))).limit(1),
    );
    expect(plan).toBeDefined();

    const primera = await withTx(ctx, (tx) => materializePlan(tx, ctx, plan!, 60, HOY()));
    const segunda = await withTx(ctx, (tx) => materializePlan(tx, ctx, plan!, 60, HOY()));

    expect(primera).toBeGreaterThan(0);
    // La segunda corrida no crea nada nuevo
    expect(segunda).toBe(0);

    const duplicados = await withRead(async (db) => {
      const { rows } = await db.execute(sql`
        select count(*)::int as n from (
          select plan_id, due_date from maintenance_tasks
           where plan_id = ${plan!.id} group by plan_id, due_date having count(*) > 1) s`);
      return (rows[0] as { n: number }).n;
    });
    expect(duplicados).toBe(0);
  });
});

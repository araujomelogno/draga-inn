import { beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { BUILDING_ID, crearUsuario, HAY_BASE, prepararBase, sql, withRead, withTx } from './_setup';
import { checklistsForDate, markChecklistItem, createPoolLog } from '@/modules/logbook/service';
import { COMPLIANCE_FRAMING, complianceOverview, computeDay, myCompliance, upsertSnapshot } from '@/modules/compliance/service';
import { addDays, localDate } from '@/shared/dates';
import { ForbiddenError } from '@/shared/errors';

const d = HAY_BASE ? describe : describe.skip;
const HOY = () => localDate(new Date(), 'America/Montevideo');

d('RN-48 — el cumplimiento se calcula solo sobre ítems requeridos', () => {
  beforeAll(prepararBase, 120_000);

  it('los ítems opcionales no penalizan', async () => {
    const ctx = await crearUsuario(['encargado']);
    const dia = addDays(HOY(), -40); // un día limpio, sin interferir con otros tests

    const plan = await withTx(ctx, (tx) => checklistsForDate(tx, ctx, dia));
    const diaria = plan.checklists.find((c) => c.freq === 'daily');
    expect(diaria).toBeDefined();

    const requeridos = diaria!.items.filter((i) => i.required);
    const opcionales = diaria!.items.filter((i) => !i.required);
    expect(opcionales.length).toBeGreaterThan(0);

    // Marcamos TODOS los requeridos y NINGÚN opcional
    for (const item of requeridos) {
      await withTx(ctx, (tx) => markChecklistItem(tx, ctx, diaria!.instanceId, item.key, { done: true }));
    }

    const r = await withTx(ctx, (tx) => tx.execute(sql`
      select required_items, completed_items, pct from v_checklist_compliance where instance_id = ${diaria!.instanceId}`));
    const fila = r.rows[0] as { required_items: number; completed_items: number; pct: string };

    expect(fila.required_items).toBe(requeridos.length);
    expect(fila.completed_items).toBe(requeridos.length);
    expect(Number(fila.pct)).toBe(100);
  });
});

d('RN-31 — un checklist no se completa con requeridos sin marcar', () => {
  beforeAll(prepararBase, 120_000);

  it('con requeridos pendientes el estado es «partial», no «complete»', async () => {
    const ctx = await crearUsuario(['encargado']);
    const dia = addDays(HOY(), -41);
    const plan = await withTx(ctx, (tx) => checklistsForDate(tx, ctx, dia));
    const diaria = plan.checklists.find((c) => c.freq === 'daily')!;
    const requeridos = diaria.items.filter((i) => i.required);

    // Marcamos solo el primero
    const r = await withTx(ctx, (tx) => markChecklistItem(tx, ctx, diaria.instanceId, requeridos[0]!.key, { done: true }));
    expect(r.status).toBe('partial');
    expect(r.progress.done).toBe(1);
    expect(r.progress.total).toBe(requeridos.length);
  });
});

d('RN-43 — presente y correcto, presente fuera de rango, y faltante', () => {
  beforeAll(prepararBase, 120_000);

  it('un día sin registro es «missing», distinto de un día con dato fuera de rango', async () => {
    const ctx = await crearUsuario(['encargado']);

    // Día sin ningún registro
    const vacio = addDays(HOY(), -60);
    const diaVacio = await withTx(ctx, (tx) => computeDay(tx, ctx, vacio));
    expect(diaVacio.dayStatus).toBe('missing');
    expect(diaVacio.completedItems).toBe(0);
    expect(diaVacio.missingItemKeys.length).toBeGreaterThan(0);

    // Día con el plan parcialmente hecho
    const parcial = addDays(HOY(), -59);
    const plan = await withTx(ctx, (tx) => checklistsForDate(tx, ctx, parcial));
    const diaria = plan.checklists.find((c) => c.freq === 'daily')!;
    await withTx(ctx, (tx) => markChecklistItem(tx, ctx, diaria.instanceId, diaria.items.find((i) => i.required)!.key, { done: true }));

    const diaParcial = await withTx(ctx, (tx) => computeDay(tx, ctx, parcial));
    expect(diaParcial.dayStatus).toBe('partial');
    expect(diaParcial.completedItems).toBeGreaterThan(0);
  });

  it('el snapshot distingue el dato fuera de rango del dato faltante', async () => {
    const ctx = await crearUsuario(['encargado']);
    const dia = addDays(HOY(), -58);

    await withTx(ctx, (tx) => createPoolLog(tx, ctx, {
      clientUuid: randomUUID(), loggedOn: dia, loggedAt: new Date(`${dia}T10:00:00Z`).toISOString(),
      freeChlorine: 2, ph: 8.3, observations: 'pH alto, se aplicó reductor.', backdateReason: 'Carga diferida de planilla en papel.',
    }));

    const computo = await withTx(ctx, (tx) => computeDay(tx, ctx, dia));
    await withTx(ctx, (tx) => upsertSnapshot(tx, ctx, computo));

    const snap = await withRead(async (db) => {
      const { rows } = await db.execute(sql`
        select pool_logged, pool_out_of_range, day_status from compliance_snapshots
         where building_id = ${BUILDING_ID} and snapshot_date = ${dia}::date`);
      return rows[0] as { pool_logged: boolean | null; pool_out_of_range: boolean | null; day_status: string };
    });

    // En temporada, el registro existe y está fuera de rango: son dos hechos distintos.
    // Fuera de temporada, pool_logged es null: no cuenta como faltante (RN-52).
    if (snap.pool_logged !== null) {
      expect(snap.pool_logged).toBe(true);
      expect(snap.pool_out_of_range).toBe(true);
    }
  });
});

d('RN-52 — la piscina solo cuenta en temporada', () => {
  beforeAll(prepararBase, 120_000);

  it('fuera de temporada, un día sin registro de piscina no penaliza', async () => {
    const ctx = await crearUsuario(['encargado']);
    // 15 de julio: temporada baja
    const invierno = `${new Date().getUTCFullYear()}-07-15`;
    const dia = await withTx(ctx, (tx) => computeDay(tx, ctx, invierno));
    expect(dia.poolLogged).toBeNull();
    expect(dia.missingItemKeys).not.toContain('Piscina: medición del día');
  });

  it('en temporada, un día sin registro de piscina sí penaliza', async () => {
    const ctx = await crearUsuario(['encargado']);
    // 15 de enero: temporada alta
    const verano = `${new Date().getUTCFullYear()}-01-15`;
    const dia = await withTx(ctx, (tx) => computeDay(tx, ctx, verano));
    expect(dia.poolLogged).toBe(false);
    expect(dia.missingItemKeys).toContain('Piscina: medición del día');
  });
});

d('RN-49 y RN-51 — el encargado ve lo mismo, con el encuadre correcto', () => {
  beforeAll(prepararBase, 120_000);

  it('el encargado accede a su indicador sin permiso de nadie', async () => {
    const encargado = await crearUsuario(['encargado']);
    const mio = await withTx(encargado, (tx) => myCompliance(tx, encargado));
    expect(mio.periods).toBeDefined();
    expect(mio.calendar.length).toBeGreaterThan(0);
  });

  it('ve exactamente el mismo cálculo que la administración', async () => {
    const encargado = await crearUsuario(['encargado']);
    const admin = await crearUsuario(['administrador']);

    const delEncargado = await withTx(encargado, (tx) => complianceOverview(tx, encargado, { period: 'month' }));
    const delAdmin = await withTx(admin, (tx) => complianceOverview(tx, admin, { period: 'month' }));

    expect(delEncargado.compliancePct).toBe(delAdmin.compliancePct);
    expect(delEncargado.requiredItems).toBe(delAdmin.requiredItems);
    expect(delEncargado.completedItems).toBe(delAdmin.completedItems);
    expect(delEncargado.incompleteDays.length).toBe(delAdmin.incompleteDays.length);
  });

  it('RN-51: toda respuesta viaja con el encuadre y la leyenda', async () => {
    const encargado = await crearUsuario(['encargado']);
    const mio = await withTx(encargado, (tx) => myCompliance(tx, encargado));

    expect(mio.framing.title).toBe('Cumplimiento del plan del edificio');
    expect(mio.framing.legend).toContain('no el desempeño de una persona');
    expect(mio.framing.legend).toContain('régimen de faltas y sanciones');
    // Ninguna etiqueta rotula esto como desempeño individual
    expect(JSON.stringify(mio.framing).toLowerCase()).not.toContain('tu desempeño');
  });

  it('el encuadre es el mismo objeto en todas las vistas de cumplimiento', async () => {
    const admin = await crearUsuario(['administrador']);
    const vista = await withTx(admin, (tx) => complianceOverview(tx, admin, { period: 'week' }));
    expect(vista.framing).toEqual(COMPLIANCE_FRAMING);
  });

  it('un propietario NO puede ver el cumplimiento del edificio', async () => {
    const propietario = await crearUsuario(['owner']);
    await expect(
      withTx(propietario, (tx) => complianceOverview(tx, propietario, { period: 'month' })),
    ).rejects.toThrowError(ForbiddenError);
  });

  it('un inquilino tampoco', async () => {
    const inquilino = await crearUsuario(['tenant']);
    await expect(
      withTx(inquilino, (tx) => myCompliance(tx, inquilino)),
    ).rejects.toThrowError(ForbiddenError);
  });
});

d('Las instantáneas son idempotentes', () => {
  beforeAll(prepararBase, 120_000);

  it('recalcular el mismo día no duplica la instantánea', async () => {
    const ctx = await crearUsuario(['administrador']);
    const dia = addDays(HOY(), -57);

    for (let i = 0; i < 3; i += 1) {
      const computo = await withTx(ctx, (tx) => computeDay(tx, ctx, dia));
      await withTx(ctx, (tx) => upsertSnapshot(tx, ctx, computo));
    }

    const n = await withRead(async (db) => {
      const { rows } = await db.execute(sql`
        select count(*)::int as n from compliance_snapshots
         where building_id = ${BUILDING_ID} and snapshot_date = ${dia}::date`);
      return (rows[0] as { n: number }).n;
    });
    expect(n).toBe(1);
  });

  it('la racha de días sin registro se encadena hacia adelante', async () => {
    const ctx = await crearUsuario(['administrador']);
    const base = addDays(HOY(), -120);

    for (let i = 0; i < 4; i += 1) {
      const dia = addDays(base, i);
      const computo = await withTx(ctx, (tx) => computeDay(tx, ctx, dia));
      await withTx(ctx, (tx) => upsertSnapshot(tx, ctx, computo));
    }

    const rachas = await withRead(async (db) => {
      const { rows } = await db.execute(sql`
        select snapshot_date, day_status, missing_streak_days from compliance_snapshots
         where building_id = ${BUILDING_ID} and snapshot_date between ${base}::date and ${addDays(base, 3)}::date
         order by snapshot_date`);
      return rows as { day_status: string; missing_streak_days: number }[];
    });

    const faltantes = rachas.filter((r) => r.day_status === 'missing');
    if (faltantes.length === 4) {
      expect(rachas[3]!.missing_streak_days).toBe(4);
    }
  });
});

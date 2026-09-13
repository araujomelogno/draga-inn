import { beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { auditoriaDe, crearUsuario, HAY_BASE, prepararBase, sql, withRead, withTx, BUILDING_ID } from './_setup';
import { createTicket, updateTicket } from '@/modules/tickets/service';
import { appendEvent, openCase } from '@/modules/cases/repo';

const d = HAY_BASE ? describe : describe.skip;

d('CLAUDE.md regla 2 — la auditoría vive en la base y no se puede saltear', () => {
  beforeAll(prepararBase, 120_000);

  it('un INSERT escribe audit_log con el autor y su rol', async () => {
    const ctx = await crearUsuario(['administrador']);
    const { ticket } = await withTx(ctx, (tx) => createTicket(tx, ctx, {
      description: 'Hay una pérdida de agua en el subsuelo, cerca de la bomba.',
      category: 'plomeria', priority: 'normal', source: 'admin', photoDocumentIds: [],
    }));

    const filas = await auditoriaDe('tickets', ticket.id);
    expect(filas).toHaveLength(1);
    expect(filas[0]!.action).toBe('INSERT');
    expect(filas[0]!.actor_user_id).toBe(ctx.user.id);
    expect(filas[0]!.actor_role).toBe('administrador');
    expect(filas[0]!.request_id).toBe(ctx.requestId);
    expect(filas[0]!.after?.description).toContain('pérdida de agua');
  });

  it('un UPDATE registra before y after con los campos que cambiaron', async () => {
    const ctx = await crearUsuario(['administrador']);
    const { ticket } = await withTx(ctx, (tx) => createTicket(tx, ctx, {
      description: 'La luz del palier del tercer piso está quemada.',
      category: 'electricidad', priority: 'normal', source: 'admin', photoDocumentIds: [],
    }));

    await withTx(ctx, (tx) => updateTicket(tx, ctx, ticket.id, { priority: 'high' }));

    const filas = await auditoriaDe('tickets', ticket.id);
    const update = filas.find((f) => f.action === 'UPDATE');
    expect(update).toBeDefined();
    expect(update!.changed_fields).toContain('priority');
    expect(update!.before?.priority).toBe('normal');
    expect(update!.after?.priority).toBe('high');
    // `updated_at` sola no ensucia el registro de cambios
    expect(update!.changed_fields).not.toContain('updated_at');
  });

  it('una escritura hecha fuera de withTx queda registrada SIN autor: por eso withTx es obligatorio', async () => {
    // Simulamos el atajo prohibido: insertar sin declarar quién actúa.
    const id = randomUUID();
    await withRead(async (db) => {
      await db.execute(sql`
        insert into vendors (id, building_id, legal_name, status)
        values (${id}::uuid, ${BUILDING_ID}, 'Proveedor sin autor', 'active')`);
    });
    const filas = await auditoriaDe('vendors', id);
    expect(filas).toHaveLength(1);
    // El hecho igual se audita — la base no se puede saltear — pero queda huérfano.
    expect(filas[0]!.actor_user_id).toBeNull();
  });

  it('RN-19: audit_log no se puede modificar ni borrar, ni siquiera con SQL directo', async () => {
    const antes = await withRead(async (db) => {
      const { rows } = await db.execute(sql`select count(*)::int as n from audit_log`);
      return (rows[0] as { n: number }).n;
    });

    await withRead(async (db) => { await db.execute(sql`update audit_log set action = 'ALTERADO'`); });
    await withRead(async (db) => { await db.execute(sql`delete from audit_log`); });

    const despues = await withRead(async (db) => {
      const { rows } = await db.execute(sql`
        select count(*)::int as n, count(*) filter (where action = 'ALTERADO')::int as alterados from audit_log`);
      return rows[0] as { n: number; alterados: number };
    });

    expect(despues.n).toBeGreaterThanOrEqual(antes);
    expect(despues.alterados).toBe(0);
  });
});

d('case_events es append-only', () => {
  beforeAll(prepararBase, 120_000);

  it('no se puede hacer UPDATE sobre la línea de tiempo', async () => {
    const ctx = await crearUsuario(['administrador']);
    const kase = await withTx(ctx, (tx) => openCase(tx, ctx, { title: 'Expediente de prueba append-only' }));
    await withTx(ctx, (tx) => appendEvent(tx, ctx, { caseId: kase.id, eventType: 'case_status_changed', note: 'original' }));

    await expect(
      withRead(async (db) => db.execute(sql`update case_events set note = 'reescrito' where case_id = ${kase.id}`)),
    ).rejects.toThrow(/append-only/i);
  });

  it('no se puede hacer DELETE sobre la línea de tiempo', async () => {
    const ctx = await crearUsuario(['administrador']);
    const kase = await withTx(ctx, (tx) => openCase(tx, ctx, { title: 'Expediente de prueba borrado' }));

    await expect(
      withRead(async (db) => db.execute(sql`delete from case_events where case_id = ${kase.id}`)),
    ).rejects.toThrow(/append-only/i);
  });

  it('approvals tampoco se actualiza: una corrección crea una fila con supersedes_id', async () => {
    const ctx = await crearUsuario(['comision']);
    const kase = await withTx(ctx, (tx) => openCase(tx, ctx, { title: 'Expediente de aprobación' }));

    const id = await withTx(ctx, async (tx) => {
      const { rows } = await tx.execute(sql`
        insert into approvals (building_id, case_id, subject_type, subject_id, decision,
                               approver_user_id, approver_role, rationale)
        values (${BUILDING_ID}, ${kase.id}, 'quote', ${randomUUID()}::uuid, 'approved',
                ${ctx.user.id}::uuid, 'comision', 'Fundamento original de la aprobación.')
        returning id`);
      return (rows[0] as { id: string }).id;
    });

    await expect(
      withRead(async (db) => db.execute(sql`update approvals set decision = 'rejected' where id = ${id}::uuid`)),
    ).rejects.toThrow(/append-only/i);
  });
});

import { beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { BUILDING_ID, crearUsuario, HAY_BASE, prepararBase, sql, unProveedor, withRead, withTx } from './_setup';
import { createTicket, addComment, listComments } from '@/modules/tickets/service';
import { createQuote, recordApproval, issueWorkOrder, acceptWorkOrder, createInvoice, validateInvoice } from '@/modules/procurement/service';
import { closureBlockers, changeCaseStatus } from '@/modules/cases/repo';
import { ConflictError, ForbiddenError, GovernanceError } from '@/shared/errors';

const d = HAY_BASE ? describe : describe.skip;

async function expedienteConTicket(roles: Parameters<typeof crearUsuario>[0] = ['administrador']) {
  const ctx = await crearUsuario(roles);
  const { ticket } = await withTx(ctx, (tx) => createTicket(tx, ctx, {
    description: 'Hay que reparar la bomba de achique del subsuelo, pierde presión.',
    category: 'plomeria', priority: 'high', source: 'admin', photoDocumentIds: [],
  }));
  return { ctx, ticket };
}

d('RN-20 — no se emite orden de trabajo sin los requisitos de gobernanza', () => {
  beforeAll(prepararBase, 120_000);

  it('con 1 presupuesto sobre el umbral medio, la emisión falla y dice qué falta', async () => {
    const { ctx, ticket } = await expedienteConTicket();
    const vendorId = await withTx(ctx, (tx) => unProveedor(tx));

    const quote = await withTx(ctx, (tx) => createQuote(tx, ctx, {
      caseId: ticket.caseId, vendorId, description: 'Reparación de bomba', amount: '50000.00',
      currency: 'UYU', validUntil: null, leadTimeDays: 5,
    }));

    await expect(
      withTx(ctx, (tx) => issueWorkOrder(tx, ctx, {
        caseId: ticket.caseId, vendorId, quoteId: quote.id, scope: 'Reparación integral de la bomba de achique.',
      })),
    ).rejects.toThrowError(GovernanceError);

    try {
      await withTx(ctx, (tx) => issueWorkOrder(tx, ctx, {
        caseId: ticket.caseId, vendorId, quoteId: quote.id, scope: 'Reparación integral de la bomba de achique.',
      }));
    } catch (err) {
      const e = err as GovernanceError;
      expect(e.code).toBe('GOVERNANCE_RULE_UNMET');
      expect(e.message).toMatch(/presupuesto/i);
      expect(e.details?.requiredQuotes).toBe(2);
    }
  });

  it('con los presupuestos y la aprobación, la orden se emite', async () => {
    const { ctx, ticket } = await expedienteConTicket();
    const v1 = await withTx(ctx, (tx) => unProveedor(tx));
    const v2 = await withTx(ctx, (tx) => unProveedor(tx));

    const q1 = await withTx(ctx, (tx) => createQuote(tx, ctx, {
      caseId: ticket.caseId, vendorId: v1, description: 'Opción A', amount: '50000.00', currency: 'UYU', validUntil: null,
    }));
    await withTx(ctx, (tx) => createQuote(tx, ctx, {
      caseId: ticket.caseId, vendorId: v2, description: 'Opción B', amount: '62000.00', currency: 'UYU', validUntil: null,
    }));

    await withTx(ctx, (tx) => recordApproval(tx, ctx, {
      caseId: ticket.caseId, subjectType: 'quote', subjectId: q1.id, decision: 'approved',
      rationale: 'Mejor relación precio-plazo y el proveedor ya trabajó en el edificio.', isException: false,
    }));

    const r = await withTx(ctx, (tx) => issueWorkOrder(tx, ctx, {
      caseId: ticket.caseId, vendorId: v1, quoteId: q1.id, scope: 'Reparación integral de la bomba de achique.',
    }));

    expect(r.workOrder.status).toBe('issued');
    expect(r.withException).toBe(false);
  });

  it('la excepción de gobernanza deja emitir, pero queda registrada y visible', async () => {
    const { ctx, ticket } = await expedienteConTicket();
    const vendorId = await withTx(ctx, (tx) => unProveedor(tx));
    const quote = await withTx(ctx, (tx) => createQuote(tx, ctx, {
      caseId: ticket.caseId, vendorId, description: 'Urgencia', amount: '50000.00', currency: 'UYU', validUntil: null,
    }));

    const r = await withTx(ctx, (tx) => issueWorkOrder(tx, ctx, {
      caseId: ticket.caseId, vendorId, quoteId: quote.id, scope: 'Reparación de urgencia por inundación inminente.',
      governanceException: { reason: 'Riesgo de inundación del subsuelo: no había tiempo para pedir tres presupuestos.' },
    }));

    expect(r.withException).toBe(true);

    // RN-02: la excepción aparece en la línea de tiempo del expediente
    const eventos = await withRead(async (db) => {
      const { rows } = await db.execute(sql`
        select event_type, note from case_events where case_id = ${ticket.caseId} and event_type = 'governance_exception'`);
      return rows as { event_type: string; note: string }[];
    });
    expect(eventos.length).toBeGreaterThan(0);
    expect(eventos[0]!.note).toContain('inundación');
  });

  it('el encargado no puede emitir órdenes de trabajo', async () => {
    const { ctx, ticket } = await expedienteConTicket();
    const encargado = await crearUsuario(['encargado']);
    const vendorId = await withTx(ctx, (tx) => unProveedor(tx));

    await expect(
      withTx(encargado, (tx) => issueWorkOrder(tx, encargado, {
        caseId: ticket.caseId, vendorId, scope: 'Intento sin permiso de emisión de orden.',
      })),
    ).rejects.toThrowError(ForbiddenError);
  });
});

d('§7 — quién aprueba según el monto', () => {
  beforeAll(prepararBase, 120_000);

  it('el administrador no puede aprobar por encima del umbral de la comisión', async () => {
    const { ctx, ticket } = await expedienteConTicket(['administrador']);
    const vendorId = await withTx(ctx, (tx) => unProveedor(tx));
    const quote = await withTx(ctx, (tx) => createQuote(tx, ctx, {
      caseId: ticket.caseId, vendorId, description: 'Obra mayor', amount: '250000.00', currency: 'UYU', validUntil: null,
    }));

    await expect(
      withTx(ctx, (tx) => recordApproval(tx, ctx, {
        caseId: ticket.caseId, subjectType: 'quote', subjectId: quote.id, decision: 'approved',
        rationale: 'Intento de aprobar por encima del umbral que me corresponde.', isException: false,
      })),
    ).rejects.toThrowError(ForbiddenError);
  });

  it('la comisión sí puede aprobar por encima del umbral', async () => {
    const comision = await crearUsuario(['comision']);
    const { ctx, ticket } = await expedienteConTicket(['administrador']);
    const vendorId = await withTx(ctx, (tx) => unProveedor(tx));
    const quote = await withTx(ctx, (tx) => createQuote(tx, ctx, {
      caseId: ticket.caseId, vendorId, description: 'Obra mayor', amount: '250000.00', currency: 'UYU', validUntil: null,
    }));

    const aprobacion = await withTx(comision, (tx) => recordApproval(tx, comision, {
      caseId: ticket.caseId, subjectType: 'quote', subjectId: quote.id, decision: 'approved',
      rationale: 'Se aprueba por resolución de comisión del 12 de junio.', isException: false,
    }));
    expect(aprobacion.approverRole).toBe('comision');
  });

  it('el mensaje de rechazo le dice al administrador a quién pedírselo', async () => {
    const { ctx, ticket } = await expedienteConTicket(['administrador']);
    const vendorId = await withTx(ctx, (tx) => unProveedor(tx));
    const quote = await withTx(ctx, (tx) => createQuote(tx, ctx, {
      caseId: ticket.caseId, vendorId, description: 'Obra mayor', amount: '300000.00', currency: 'UYU', validUntil: null,
    }));

    try {
      await withTx(ctx, (tx) => recordApproval(tx, ctx, {
        caseId: ticket.caseId, subjectType: 'quote', subjectId: quote.id, decision: 'approved',
        rationale: 'Intento fuera de mi umbral de aprobación.', isException: false,
      }));
      expect.unreachable('debería haber fallado');
    } catch (err) {
      const e = err as ForbiddenError;
      // P6: el error explica qué hacer, no qué falló
      expect(e.message).toContain('Comisión');
      expect(e.details?.requiredRole).toBe('comision');
    }
  });

  it('CB-08 — dos aprobaciones simultáneas: la segunda falla por conflicto', async () => {
    const { ctx, ticket } = await expedienteConTicket();
    const vendorId = await withTx(ctx, (tx) => unProveedor(tx));
    const quote = await withTx(ctx, (tx) => createQuote(tx, ctx, {
      caseId: ticket.caseId, vendorId, description: 'Trabajo menor', amount: '9000.00', currency: 'UYU', validUntil: null,
    }));

    await withTx(ctx, (tx) => recordApproval(tx, ctx, {
      caseId: ticket.caseId, subjectType: 'quote', subjectId: quote.id, decision: 'approved',
      rationale: 'Primera aprobación, la que queda vigente.', isException: false,
    }));

    await expect(
      withTx(ctx, (tx) => recordApproval(tx, ctx, {
        caseId: ticket.caseId, subjectType: 'quote', subjectId: quote.id, decision: 'rejected',
        rationale: 'Segunda decisión sobre el mismo presupuesto.', isException: false,
      })),
    ).rejects.toThrowError(ConflictError);
  });

  it('CB-07 — un presupuesto vencido no se puede aprobar', async () => {
    const { ctx, ticket } = await expedienteConTicket();
    const vendorId = await withTx(ctx, (tx) => unProveedor(tx));
    const quote = await withTx(ctx, (tx) => createQuote(tx, ctx, {
      caseId: ticket.caseId, vendorId, description: 'Presupuesto viejo', amount: '9000.00',
      currency: 'UYU', validUntil: '2020-01-01',
    }));

    await expect(
      withTx(ctx, (tx) => recordApproval(tx, ctx, {
        caseId: ticket.caseId, subjectType: 'quote', subjectId: quote.id, decision: 'approved',
        rationale: 'Intento de aprobar un presupuesto vencido.', isException: false,
      })),
    ).rejects.toThrowError(ConflictError);
  });
});

d('RN-15 y RN-16 — facturación', () => {
  beforeAll(prepararBase, 120_000);

  async function ordenEmitida() {
    const { ctx, ticket } = await expedienteConTicket();
    const vendorId = await withTx(ctx, (tx) => unProveedor(tx));
    const q1 = await withTx(ctx, (tx) => createQuote(tx, ctx, {
      caseId: ticket.caseId, vendorId, description: 'A', amount: '50000.00', currency: 'UYU', validUntil: null,
    }));
    await withTx(ctx, (tx) => createQuote(tx, ctx, {
      caseId: ticket.caseId, vendorId, description: 'B', amount: '55000.00', currency: 'UYU', validUntil: null,
    }));
    await withTx(ctx, (tx) => recordApproval(tx, ctx, {
      caseId: ticket.caseId, subjectType: 'quote', subjectId: q1.id, decision: 'approved',
      rationale: 'Es la opción más conveniente en precio y plazo.', isException: false,
    }));
    const { workOrder } = await withTx(ctx, (tx) => issueWorkOrder(tx, ctx, {
      caseId: ticket.caseId, vendorId, quoteId: q1.id, scope: 'Reparación de la bomba.',
    }));
    return { ctx, ticket, vendorId, workOrder };
  }

  it('RN-15: no se carga factura sin conformidad previa', async () => {
    const { ctx, vendorId, workOrder } = await ordenEmitida();

    await expect(
      withTx(ctx, (tx) => createInvoice(tx, ctx, {
        vendorId, workOrderId: workOrder.id, number: 'A-0001', issueDate: '2026-06-15',
        amount: '50000.00', currency: 'UYU',
      })),
    ).rejects.toThrowError(GovernanceError);
  });

  it('RN-15: con excepción fundada se puede, y queda auditada', async () => {
    const { ctx, ticket, vendorId, workOrder } = await ordenEmitida();

    const factura = await withTx(ctx, (tx) => createInvoice(tx, ctx, {
      vendorId, workOrderId: workOrder.id, number: 'A-0002', issueDate: '2026-06-15',
      amount: '50000.00', currency: 'UYU',
      acceptanceException: { reason: 'El proveedor facturó antes de la visita de conformidad, se acepta con reserva.' },
    }));
    expect(factura.id).toBeTruthy();

    const excepciones = await withRead(async (db) => {
      const { rows } = await db.execute(sql`
        select count(*)::int as n from approvals where case_id = ${ticket.caseId} and is_exception`);
      return (rows[0] as { n: number }).n;
    });
    expect(excepciones).toBeGreaterThan(0);
  });

  it('con conformidad registrada, la factura entra sin excepción', async () => {
    const { ctx, vendorId, workOrder } = await ordenEmitida();
    await withTx(ctx, (tx) => acceptWorkOrder(tx, ctx, workOrder.id, {
      acceptanceNotes: 'Trabajo terminado y probado. Funciona correctamente.', photoDocumentIds: [],
    }));

    const factura = await withTx(ctx, (tx) => createInvoice(tx, ctx, {
      vendorId, workOrderId: workOrder.id, number: 'A-0003', issueDate: '2026-06-15',
      amount: '50000.00', currency: 'UYU',
    }));
    const validada = await withTx(ctx, (tx) => validateInvoice(tx, ctx, factura.id));
    expect(validada.status).toBe('validated');
  });

  it('RN-16: una factura muy por encima del aprobado exige nueva aprobación', async () => {
    const { ctx, vendorId, workOrder } = await ordenEmitida();
    await withTx(ctx, (tx) => acceptWorkOrder(tx, ctx, workOrder.id, {
      acceptanceNotes: 'Trabajo terminado, con materiales extra no previstos.', photoDocumentIds: [],
    }));

    // Aprobado 50.000; tolerancia 10 % ⇒ techo 55.000. Facturan 70.000.
    const factura = await withTx(ctx, (tx) => createInvoice(tx, ctx, {
      vendorId, workOrderId: workOrder.id, number: 'A-0004', issueDate: '2026-06-15',
      amount: '70000.00', currency: 'UYU',
    }));

    await expect(withTx(ctx, (tx) => validateInvoice(tx, ctx, factura.id))).rejects.toThrowError(GovernanceError);
  });
});

d('RN-14 — el comentario interno nunca llega al propietario', () => {
  beforeAll(prepararBase, 120_000);

  it('la API no devuelve comentarios internos a un propietario (test negativo obligatorio)', async () => {
    const admin = await crearUsuario(['administrador']);
    const { ticket } = await expedienteConTicket(['administrador']);

    await withTx(admin, (tx) => addComment(tx, admin, ticket.id, {
      body: 'Visible: estamos coordinando la visita del plomero para el martes.', isInternal: false,
    }));
    await withTx(admin, (tx) => addComment(tx, admin, ticket.id, {
      body: 'INTERNO: el proveedor anterior nos dejó plantados, no volver a llamarlo.', isInternal: true,
    }));

    const propietario = await crearUsuario(['owner']);
    const vistosPorPropietario = await withRead((db) => listComments(db, propietario, ticket.id));

    expect(vistosPorPropietario).toHaveLength(1);
    expect(vistosPorPropietario.every((c) => c.isInternal === false)).toBe(true);
    // El texto interno no aparece por ninguna vía
    expect(JSON.stringify(vistosPorPropietario)).not.toContain('INTERNO');
    expect(JSON.stringify(vistosPorPropietario)).not.toContain('plantados');

    // El staff sí lo ve
    const vistosPorAdmin = await withRead((db) => listComments(db, admin, ticket.id));
    expect(vistosPorAdmin).toHaveLength(2);
  });

  it('un propietario no puede crear un comentario interno', async () => {
    const { ticket } = await expedienteConTicket(['administrador']);
    const propietario = await crearUsuario(['owner']);

    await expect(
      withTx(propietario, (tx) => addComment(tx, propietario, ticket.id, {
        body: 'Intento de marcar esto como interno.', isInternal: true,
      })),
    ).rejects.toThrowError(ForbiddenError);
  });
});

d('RN-01 — un expediente no cierra con pendientes', () => {
  beforeAll(prepararBase, 120_000);

  it('con un ticket abierto, el cierre se bloquea y dice qué falta', async () => {
    const { ctx, ticket } = await expedienteConTicket();

    const bloqueos = await withRead((db) => closureBlockers(db, ctx, ticket.caseId));
    expect(bloqueos.tickets).toBeGreaterThan(0);

    await expect(
      withTx(ctx, (tx) => changeCaseStatus(tx, ctx, ticket.caseId, 'closed')),
    ).rejects.toThrowError(ConflictError);
  });
});

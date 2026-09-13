import { describe, expect, it } from 'vitest';
import { can } from '@/policy/can';
import type { Action, Subject } from '@/policy/can';
import type { AppRole } from '@/auth/context';
import { ctx, TODOS_LOS_ROLES, UNIDAD_A, UNIDAD_B } from '../helpers/ctx';

/**
 * ESPEC_FUNCIONAL_v1 §7 — Matriz de permisos.
 *
 * «Por cada fila con ❌ debe existir un test negativo que verifique el rechazo
 * a nivel de API, no solo de interfaz.» Esta tabla reproduce la matriz completa
 * y genera el test positivo y el negativo de cada celda.
 */
type Fila = { accion: string; subject: Subject; action: Action; permitidos: AppRole[] };

const MATRIZ: Fila[] = [
  { accion: 'Ver su unidad', subject: 'unit', action: 'read', permitidos: ['owner', 'tenant', 'encargado', 'administrador', 'comision', 'auditor'] },
  { accion: 'Ver otras unidades', subject: 'unit_other', action: 'read', permitidos: ['encargado', 'administrador', 'comision', 'auditor'] },
  { accion: 'Crear reclamo', subject: 'ticket', action: 'create', permitidos: ['owner', 'tenant', 'encargado', 'administrador', 'comision'] },
  { accion: 'Ver comentarios internos', subject: 'ticket_internal_comment', action: 'read', permitidos: ['encargado', 'administrador', 'comision'] },
  { accion: 'Cambiar estado de ticket', subject: 'ticket_status', action: 'update', permitidos: ['encargado', 'administrador'] },
  { accion: 'Asignar responsable', subject: 'ticket', action: 'assign', permitidos: ['administrador'] },
  { accion: 'Registrar planillas', subject: 'logbook', action: 'create', permitidos: ['encargado', 'administrador'] },
  { accion: 'Ver su propio cumplimiento', subject: 'compliance_self', action: 'read', permitidos: ['encargado', 'administrador', 'comision'] },
  { accion: 'Ver cumplimiento del edificio', subject: 'compliance_building', action: 'read', permitidos: ['encargado', 'administrador', 'comision'] },
  { accion: 'Cargar presupuesto', subject: 'quote', action: 'create', permitidos: ['administrador', 'comision'] },
  { accion: 'Aprobar bajo umbral', subject: 'approval_below', action: 'approve', permitidos: ['administrador', 'comision'] },
  { accion: 'Aprobar sobre umbral', subject: 'approval_above', action: 'approve', permitidos: ['comision'] },
  { accion: 'Registrar excepción de gobernanza', subject: 'governance_exception', action: 'create', permitidos: ['administrador', 'comision'] },
  { accion: 'Emitir orden de trabajo', subject: 'work_order', action: 'create', permitidos: ['administrador'] },
  { accion: 'Validar factura', subject: 'invoice', action: 'update', permitidos: ['administrador', 'comision'] },
  { accion: 'Publicar documento a propietarios', subject: 'document', action: 'publish', permitidos: ['administrador', 'comision'] },
  { accion: 'Ver auditoría', subject: 'audit', action: 'read', permitidos: ['administrador', 'comision', 'auditor'] },
  { accion: 'Exportar contable', subject: 'accounting_export', action: 'export', permitidos: ['administrador', 'comision', 'contador'] },
  { accion: 'Configurar reglas de gobernanza', subject: 'governance_rule', action: 'create', permitidos: ['comision'] },
  { accion: 'Gestionar usuarios y roles', subject: 'user', action: 'update', permitidos: ['administrador', 'comision'] },
];

describe('§7 — matriz de permisos', () => {
  for (const fila of MATRIZ) {
    describe(fila.accion, () => {
      for (const rol of fila.permitidos) {
        it(`permite a ${rol}`, () => {
          expect(can(ctx([rol]), fila.action, fila.subject)).toBe(true);
        });
      }
      // Test NEGATIVO por cada ❌ de la matriz
      for (const rol of TODOS_LOS_ROLES.filter((r) => !fila.permitidos.includes(r))) {
        it(`rechaza a ${rol}`, () => {
          expect(can(ctx([rol]), fila.action, fila.subject)).toBe(false);
        });
      }
    });
  }
});

describe('aislamiento entre unidades', () => {
  it('un propietario no puede leer un ticket de otra unidad', () => {
    const propietario = ctx(['owner'], { unitIds: [UNIDAD_A] });
    expect(can(propietario, 'read', 'ticket', { unitId: UNIDAD_B, reportedByUserId: 'otro' })).toBe(false);
  });

  it('un propietario sí puede leer un ticket de su unidad', () => {
    const propietario = ctx(['owner'], { unitIds: [UNIDAD_A] });
    expect(can(propietario, 'read', 'ticket', { unitId: UNIDAD_A })).toBe(true);
  });

  it('un propietario puede leer un ticket de área común', () => {
    const propietario = ctx(['owner'], { unitIds: [UNIDAD_A] });
    expect(can(propietario, 'read', 'ticket', { unitId: null })).toBe(true);
  });

  it('un propietario puede leer el ticket que él mismo reportó', () => {
    const propietario = ctx(['owner'], { unitIds: [UNIDAD_A] });
    expect(can(propietario, 'read', 'ticket', { unitId: UNIDAD_B, reportedByUserId: 'user-1' })).toBe(true);
  });

  it('un propietario no puede leer la ficha de otra unidad', () => {
    const propietario = ctx(['owner'], { unitIds: [UNIDAD_A] });
    expect(can(propietario, 'read', 'unit', { unitId: UNIDAD_B })).toBe(false);
  });

  it('el encargado sí ve unidades ajenas', () => {
    expect(can(ctx(['encargado']), 'read', 'unit', { unitId: UNIDAD_B })).toBe(true);
  });
});

describe('RN-17 — visibilidad de documentos', () => {
  it('un propietario no ve un documento interno', () => {
    expect(can(ctx(['owner']), 'read', 'document', { visibility: 'internal' })).toBe(false);
  });
  it('un propietario no ve un documento de comisión', () => {
    expect(can(ctx(['owner']), 'read', 'document', { visibility: 'committee' })).toBe(false);
  });
  it('un propietario sí ve un documento publicado a propietarios', () => {
    expect(can(ctx(['owner']), 'read', 'document', { visibility: 'owners' })).toBe(true);
  });
  it('un inquilino no puede publicar documentos', () => {
    expect(can(ctx(['tenant']), 'publish', 'document')).toBe(false);
  });
});

describe('CB-11 — usuario con dos roles ve la unión de permisos', () => {
  it('propietario + comisión puede aprobar sobre umbral', () => {
    expect(can(ctx(['owner', 'comision']), 'approve', 'approval_above')).toBe(true);
  });
  it('y sigue pudiendo crear reclamos', () => {
    expect(can(ctx(['owner', 'comision']), 'create', 'ticket')).toBe(true);
  });
});

describe('RN-19 — la auditoría es de solo lectura para todos', () => {
  for (const rol of TODOS_LOS_ROLES) {
    it(`${rol} no puede crear registros de auditoría`, () => {
      expect(can(ctx([rol]), 'create', 'audit')).toBe(false);
    });
    it(`${rol} no puede modificar la auditoría`, () => {
      expect(can(ctx([rol]), 'update', 'audit')).toBe(false);
    });
    it(`${rol} no puede borrar la auditoría`, () => {
      expect(can(ctx([rol]), 'delete', 'audit')).toBe(false);
    });
  }
});

describe('el contador no escribe', () => {
  for (const subject of ['ticket', 'quote', 'invoice', 'work_order', 'document', 'logbook'] as Subject[]) {
    it(`no puede crear ${subject}`, () => {
      expect(can(ctx(['contador']), 'create', subject)).toBe(false);
    });
  }
});

describe('el encargado nunca aprueba', () => {
  it('no aprueba bajo umbral', () => {
    expect(can(ctx(['encargado']), 'approve', 'approval_below')).toBe(false);
  });
  it('no aprueba sobre umbral', () => {
    expect(can(ctx(['encargado']), 'approve', 'approval_above')).toBe(false);
  });
  it('no emite órdenes de trabajo', () => {
    expect(can(ctx(['encargado']), 'create', 'work_order')).toBe(false);
  });
});

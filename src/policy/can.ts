import type { AuthContext, AppRole } from '@/auth/context';
import { ForbiddenError } from '@/shared/errors';

/**
 * Matriz de permisos de ESPEC_FUNCIONAL_v1 §7.
 *
 * Una sola función, usada en TODOS los endpoints. La interfaz oculta lo que el
 * rol no puede hacer (P3), pero el rechazo real vive acá: por cada ❌ de la
 * matriz hay un test negativo a nivel de API.
 */
export type Action = 'read' | 'create' | 'update' | 'delete' | 'approve' | 'export' | 'publish' | 'assign';

export type Subject =
  | 'building' | 'unit' | 'unit_other' | 'party' | 'occupancy'
  | 'case' | 'ticket' | 'ticket_status' | 'ticket_internal_comment'
  | 'asset' | 'maintenance_plan' | 'maintenance_task'
  | 'vendor' | 'quote' | 'approval_below' | 'approval_above' | 'governance_exception'
  | 'work_order' | 'invoice' | 'budget_category'
  | 'logbook' | 'compliance_self' | 'compliance_building'
  | 'document' | 'decision' | 'audit' | 'accounting_export'
  | 'governance_rule' | 'user' | 'notification' | 'monthly_report';

type Matrix = Partial<Record<Subject, Partial<Record<Action, AppRole[]>>>>;

const ALL_STAFF: AppRole[] = ['encargado', 'administrador', 'comision'];

/**
 * Tabla declarativa. Ausencia de entrada = nadie puede. Explícito siempre.
 * Las filas se corresponden una a una con §7 del documento funcional.
 */
const MATRIX: Matrix = {
  building: { read: ['encargado', 'administrador', 'comision', 'auditor'], update: ['administrador', 'comision'] },

  // "Ver su unidad" — el filtro por unidad lo aplica `scopeGuard`, no la matriz
  unit: { read: ['owner', 'tenant', ...ALL_STAFF, 'auditor'], create: ['administrador'], update: ['administrador'], delete: [] },
  // "Ver otras unidades"
  unit_other: { read: [...ALL_STAFF, 'auditor'] },
  party: { read: [...ALL_STAFF, 'auditor'], create: ['administrador'], update: ['administrador'] },
  occupancy: { read: [...ALL_STAFF, 'auditor'], create: ['administrador'], update: ['administrador'] },

  case: { read: [...ALL_STAFF, 'auditor'], create: ['encargado', 'administrador'], update: ['administrador'] },

  // "Crear reclamo"
  ticket: {
    read: ['owner', 'tenant', ...ALL_STAFF, 'auditor'],
    create: ['owner', 'tenant', 'encargado', 'administrador', 'comision'],
    update: ['encargado', 'administrador'],
    assign: ['administrador'],
  },
  // "Cambiar estado de ticket"
  ticket_status: { update: ['encargado', 'administrador'] },
  // RN-14 — "Ver comentarios internos"
  ticket_internal_comment: { read: ALL_STAFF, create: ALL_STAFF },

  asset: { read: [...ALL_STAFF, 'auditor'], create: ['administrador'], update: ['administrador'] },
  maintenance_plan: { read: [...ALL_STAFF, 'auditor'], create: ['administrador'], update: ['administrador'] },
  maintenance_task: { read: [...ALL_STAFF, 'auditor'], create: ['administrador'], update: ['encargado', 'administrador'] },

  vendor: { read: [...ALL_STAFF, 'contador', 'auditor'], create: ['administrador'], update: ['administrador'] },
  // "Cargar presupuesto"
  quote: { read: [...ALL_STAFF, 'contador', 'auditor'], create: ['administrador', 'comision'], update: ['administrador', 'comision'] },
  // "Aprobar bajo umbral"
  approval_below: { approve: ['administrador', 'comision'], read: [...ALL_STAFF, 'contador', 'auditor'] },
  // "Aprobar sobre umbral" — solo comisión
  approval_above: { approve: ['comision'], read: [...ALL_STAFF, 'contador', 'auditor'] },
  // "Registrar excepción de gobernanza"
  governance_exception: { create: ['administrador', 'comision'], read: [...ALL_STAFF, 'contador', 'auditor'] },
  // "Emitir orden de trabajo" — solo administrador
  work_order: { read: [...ALL_STAFF, 'contador', 'auditor'], create: ['administrador'], update: ['administrador'] },
  // "Validar factura"
  invoice: { read: [...ALL_STAFF, 'contador', 'auditor'], create: ['administrador'], update: ['administrador', 'comision'] },
  budget_category: { read: [...ALL_STAFF, 'contador', 'auditor'], create: ['administrador'], update: ['administrador'] },

  // "Registrar planillas"
  logbook: { read: [...ALL_STAFF, 'auditor'], create: ['encargado', 'administrador'], update: ['encargado', 'administrador'] },
  monthly_report: { read: [...ALL_STAFF, 'auditor'], create: ['encargado', 'administrador'], update: ['encargado', 'administrador'] },

  // RN-49 — el encargado ve su propio indicador sin permiso de nadie
  compliance_self: { read: ['encargado', 'administrador', 'comision'] },
  // "Ver cumplimiento y análisis del edificio"
  compliance_building: { read: ['encargado', 'administrador', 'comision'] },

  document: {
    read: ['owner', 'tenant', ...ALL_STAFF, 'contador', 'auditor'],
    create: ['encargado', 'administrador', 'comision'],
    update: ['administrador', 'comision'],
    // "Publicar documento a propietarios" — RN-17, acto explícito
    publish: ['administrador', 'comision'],
  },
  decision: { read: [...ALL_STAFF, 'auditor'], create: ['administrador', 'comision'], update: ['administrador', 'comision'] },

  // RN-19 — la auditoría es de solo lectura para todos, sin excepción
  audit: { read: ['administrador', 'comision', 'auditor'], export: ['administrador', 'comision', 'auditor'] },
  // "Exportar contable"
  accounting_export: { export: ['administrador', 'comision', 'contador'], read: ['administrador', 'comision', 'contador'] },

  // "Configurar reglas de gobernanza" — solo comisión
  governance_rule: { read: [...ALL_STAFF, 'auditor'], create: ['comision'], update: ['comision'] },
  // "Gestionar usuarios y roles"
  user: { read: ['administrador', 'comision', 'auditor'], create: ['administrador', 'comision'], update: ['administrador', 'comision'] },
  notification: { read: ['owner', 'tenant', ...ALL_STAFF, 'contador', 'auditor'], update: ['owner', 'tenant', ...ALL_STAFF, 'contador', 'auditor'] },
};

export function can(ctx: AuthContext, action: Action, subject: Subject, resource?: unknown): boolean {
  const allowed = MATRIX[subject]?.[action];
  if (!allowed || allowed.length === 0) return false;
  if (!allowed.some((r) => ctx.roles.includes(r))) return false;
  return scopeGuard(ctx, action, subject, resource);
}

/**
 * Reglas de alcance que la matriz no expresa: un propietario tiene `read` de
 * `ticket`, pero solo de los de SU unidad. Este es el guardarraíl que impide
 * exponer datos entre unidades.
 */
function scopeGuard(ctx: AuthContext, action: Action, subject: Subject, resource?: unknown): boolean {
  const isStaff = ctx.roles.some((r) => (['encargado', 'administrador', 'comision', 'auditor', 'contador'] as AppRole[]).includes(r));
  if (isStaff || !resource || typeof resource !== 'object') return true;

  const res = resource as { unitId?: string | null; reportedByUserId?: string | null; visibility?: string; isInternal?: boolean; userId?: string };

  if (subject === 'unit' && action === 'read') {
    return res.unitId ? ctx.unitIds.includes(res.unitId) : true;
  }

  if (subject === 'ticket') {
    // El propietario ve el ticket si es de su unidad o si él lo reportó.
    if (res.unitId && ctx.unitIds.includes(res.unitId)) return true;
    if (res.reportedByUserId && res.reportedByUserId === ctx.user.id) return true;
    // Ticket de área común: visible a propietarios e inquilinos.
    return res.unitId === null || res.unitId === undefined;
  }

  if (subject === 'document' && action === 'read') {
    return res.visibility === 'owners' || res.visibility === 'public';
  }

  if (subject === 'notification') {
    return res.userId === ctx.user.id;
  }

  return true;
}

/** RN-14: filtro duro. El comentario interno no sale por API para un no-staff. */
export function canSeeInternalComments(ctx: AuthContext): boolean {
  return can(ctx, 'read', 'ticket_internal_comment');
}

/** Mensaje de §9: no filtra detalles de lo que existe. */
export function assertCan(ctx: AuthContext, action: Action, subject: Subject, resource?: unknown): void {
  if (!can(ctx, action, subject, resource)) throw new ForbiddenError();
}

export { MATRIX as PERMISSION_MATRIX };

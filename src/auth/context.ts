import type { BuildingSettings } from '@/db/schema/buildings';

export type AppRole = 'owner' | 'tenant' | 'encargado' | 'administrador' | 'comision' | 'contador' | 'auditor';

export type AuthContext = {
  user: { id: string; email: string; displayName?: string };
  buildingId: string;
  buildingSettings: BuildingSettings;
  buildingTimezone: string;
  buildingCurrency: string;
  /** CB-11: un usuario puede tener varios roles. Se evalúa la unión de permisos. */
  roles: AppRole[];
  partyId?: string;
  /** Unidades del usuario — base del aislamiento entre propietarios. */
  unitIds: string[];
  requestId: string;
};

export function hasRole(ctx: AuthContext, ...roles: AppRole[]): boolean {
  return roles.some((r) => ctx.roles.includes(r));
}

/** Rol de mayor peso, para mostrar y para `app.user_role` en la auditoría. */
const WEIGHT: Record<AppRole, number> = {
  comision: 60, administrador: 50, auditor: 40, contador: 30, encargado: 20, owner: 10, tenant: 5,
};

export function primaryRole(roles: AppRole[]): AppRole | undefined {
  return [...roles].sort((a, b) => WEIGHT[b] - WEIGHT[a])[0];
}

export const ROLE_LABELS: Record<AppRole, string> = {
  owner: 'Propietario',
  tenant: 'Inquilino',
  encargado: 'Encargado',
  administrador: 'Administrador',
  comision: 'Comisión',
  contador: 'Contador',
  auditor: 'Auditor',
};

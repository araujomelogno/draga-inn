import type { AppRole, AuthContext } from '@/auth/context';
import type { BuildingSettings } from '@/db/schema/buildings';

export const BUILDING = '11111111-1111-1111-1111-111111111111';
export const OTRO_EDIFICIO = '22222222-2222-2222-2222-222222222222';
export const UNIDAD_A = 'aaaaaaaa-0000-0000-0000-000000000001';
export const UNIDAD_B = 'bbbbbbbb-0000-0000-0000-000000000002';

export function ctx(roles: AppRole[], over: Partial<AuthContext> = {}): AuthContext {
  return {
    user: { id: 'user-1', email: 'test@dragainn.uy', displayName: 'Prueba' },
    buildingId: BUILDING,
    buildingSettings: {} as BuildingSettings,
    buildingTimezone: 'America/Montevideo',
    buildingCurrency: 'UYU',
    roles,
    unitIds: [],
    requestId: 'test',
    ...over,
  };
}

export const TODOS_LOS_ROLES: AppRole[] = ['owner', 'tenant', 'encargado', 'administrador', 'comision', 'contador', 'auditor'];

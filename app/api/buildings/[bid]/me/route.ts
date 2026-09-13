import { route } from '@/api/handler';
import { ok } from '@/api/envelope';
import { PERMISSION_MATRIX } from '@/policy/can';
import { ROLE_LABELS, primaryRole } from '@/auth/context';
import { currentSeason } from '@/shared/season';

export const dynamic = 'force-dynamic';

/**
 * Quién soy y qué puedo. La interfaz lo usa para OCULTAR lo que el rol no
 * puede hacer (P3): no lo muestra deshabilitado, directamente no lo muestra.
 * El rechazo real sigue viviendo en la API.
 */
export const GET = route(async (_req, ctx) => {
  const abilities: Record<string, string[]> = {};
  for (const [subject, actions] of Object.entries(PERMISSION_MATRIX)) {
    const allowed = Object.entries(actions ?? {})
      .filter(([, roles]) => (roles ?? []).some((r) => ctx.roles.includes(r)))
      .map(([action]) => action);
    if (allowed.length > 0) abilities[subject] = allowed;
  }

  return ok({
    user: ctx.user,
    buildingId: ctx.buildingId,
    roles: ctx.roles,
    roleLabels: ctx.roles.map((r) => ROLE_LABELS[r]),
    // CB-11: con dos roles, la UI ofrece selector de contexto.
    primaryRole: primaryRole(ctx.roles),
    needsContextSwitch: ctx.roles.length > 1,
    unitIds: ctx.unitIds,
    timezone: ctx.buildingTimezone,
    currency: ctx.buildingCurrency,
    season: currentSeason(ctx.buildingSettings, ctx.buildingTimezone),
    abilities,
  });
});

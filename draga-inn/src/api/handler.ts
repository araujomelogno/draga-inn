import { randomUUID } from 'node:crypto';
import { and, eq, inArray, sql } from 'drizzle-orm';
import type { NextRequest, NextResponse } from 'next/server';
import { bearerToken, verifyIdToken } from '@/auth/firebase';
import type { AppRole, AuthContext } from '@/auth/context';
import { withRead, withTx } from '@/db/tx';
import { buildings, invitations, memberships, parties, unitOccupancies, users } from '@/db/schema';
import { ForbiddenError, NotFoundError, UnauthorizedError } from '@/shared/errors';
import { toResponse } from './envelope';

/**
 * Resuelve el AuthContext a partir del ID token de Firebase.
 *
 * HANDOFF §4.1 paso 4: si el usuario no existe todavía pero su email tiene una
 * invitación pendiente, se crea el usuario y su membership en el mismo acto.
 */
export async function resolveContext(req: NextRequest, buildingId: string): Promise<AuthContext> {
  const requestId = req.headers.get('x-request-id') ?? randomUUID();
  const decoded = await verifyIdToken(bearerToken(req.headers.get('authorization')));
  const email = (decoded.email ?? '').toLowerCase();

  const found = await withRead(async (db) => {
    const [building] = await db.select().from(buildings).where(eq(buildings.id, buildingId)).limit(1);
    if (!building) throw new NotFoundError('No encontramos el edificio.');
    const [user] = await db.select().from(users).where(eq(users.firebaseUid, decoded.uid)).limit(1);
    return { building, user };
  });

  const user = found.user ?? (await claimInvitation(decoded.uid, email, decoded.name as string | undefined, buildingId, requestId));
  if (!user.isActive) throw new ForbiddenError('Tu usuario está desactivado. Contactá al administrador.');

  const { roles, unitIds, partyId } = await withRead(async (db) => {
    const rows = await db
      .select({ role: memberships.role })
      .from(memberships)
      .where(and(eq(memberships.userId, user.id), eq(memberships.buildingId, buildingId), eq(memberships.isActive, true)));

    const roleList = rows.map((r) => r.role as AppRole);

    let units: string[] = [];
    if (user.partyId && (roleList.includes('owner') || roleList.includes('tenant'))) {
      // Solo las unidades con período vigente (RN-03). Nunca el histórico ajeno (CB-05).
      const occ = await db
        .select({ unitId: unitOccupancies.unitId })
        .from(unitOccupancies)
        .where(
          and(
            eq(unitOccupancies.buildingId, buildingId),
            eq(unitOccupancies.partyId, user.partyId),
            sql`current_date <@ ${unitOccupancies.period}`,
          ),
        );
      units = [...new Set(occ.map((o) => o.unitId))];
    }
    return { roles: roleList, unitIds: units, partyId: user.partyId ?? undefined };
  });

  if (roles.length === 0) throw new ForbiddenError('No tenés acceso a este edificio.');

  void touchLogin(user.id, requestId).catch(() => undefined);

  return {
    user: { id: user.id, email: user.email, displayName: user.displayName ?? undefined },
    buildingId,
    buildingSettings: found.building.settings,
    buildingTimezone: found.building.timezone,
    buildingCurrency: found.building.currency ?? 'UYU',
    roles,
    partyId,
    unitIds,
    requestId,
  };
}

async function claimInvitation(
  firebaseUid: string,
  email: string,
  displayName: string | undefined,
  buildingId: string,
  requestId: string,
): Promise<typeof users.$inferSelect> {
  if (!email) throw new UnauthorizedError('Tu cuenta no tiene email verificado.');

  const pending = await withRead(async (db) =>
    db
      .select()
      .from(invitations)
      .where(and(eq(invitations.buildingId, buildingId), eq(invitations.email, email), sql`${invitations.acceptedAt} is null`)),
  );
  if (pending.length === 0) throw new ForbiddenError('No tenés acceso a este edificio.');

  const bootstrapCtx: AuthContext = {
    user: { id: SYSTEM_USER_ID, email },
    buildingId,
    buildingSettings: {},
    buildingTimezone: 'America/Montevideo',
    buildingCurrency: 'UYU',
    roles: ['administrador'],
    unitIds: [],
    requestId,
  };

  return withTx(bootstrapCtx, async (tx) => {
    let resolvedParty = pending.find((i) => i.partyId)?.partyId ?? null;
    if (!resolvedParty) {
      const [p] = await tx.select({ id: parties.id }).from(parties)
        .where(and(eq(parties.buildingId, buildingId), eq(parties.email, email))).limit(1);
      resolvedParty = p?.id ?? null;
    }

    const [inserted] = await tx
      .insert(users)
      .values({ firebaseUid, email, displayName: displayName ?? email, partyId: resolvedParty })
      .returning();

    await tx
      .insert(memberships)
      .values(pending.map((i) => ({ userId: inserted!.id, buildingId, role: i.role })))
      .onConflictDoNothing();

    await tx.update(invitations).set({ acceptedAt: new Date() }).where(inArray(invitations.id, pending.map((i) => i.id)));

    return inserted!;
  });
}

/** Actor de los actos del sistema (jobs, sync interno). Existe en el seed. */
export const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000001';

async function touchLogin(userId: string, requestId: string): Promise<void> {
  const ctx: AuthContext = {
    user: { id: userId, email: '' }, buildingId: '', buildingSettings: {},
    buildingTimezone: 'America/Montevideo', buildingCurrency: 'UYU',
    roles: [], unitIds: [], requestId,
  };
  await withTx(ctx, async (tx) => {
    await tx.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, userId));
  });
}

type RouteParams = { params: Promise<Record<string, string>> };
type Handler = (req: NextRequest, ctx: AuthContext, params: Record<string, string>) => Promise<NextResponse>;

/**
 * Envoltorio de todo route handler bajo /api/buildings/:bid/...
 * Resuelve identidad, arma el contexto y traduce errores al envelope de §9.
 */
export function route(handler: Handler) {
  return async (req: NextRequest, { params }: RouteParams): Promise<NextResponse> => {
    const resolved = await params;
    const requestId = req.headers.get('x-request-id') ?? randomUUID();
    try {
      const buildingId = resolved.bid;
      if (!buildingId) throw new NotFoundError('Falta el edificio en la ruta.');
      const ctx = await resolveContext(req, buildingId);
      const res = await handler(req, ctx, resolved);
      res.headers.set('x-request-id', ctx.requestId);
      return res;
    } catch (err) {
      return toResponse(err, requestId);
    }
  };
}

/** Log estructurado sin datos personales: solo request_id y user_id (Privacidad). */
export function logEvent(ctx: AuthContext, event: string, extra?: Record<string, string | number | boolean>): void {
  console.log(JSON.stringify({
    severity: 'INFO', event, requestId: ctx.requestId, userId: ctx.user.id, buildingId: ctx.buildingId, ...extra,
  }));
}

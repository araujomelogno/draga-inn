import { and, eq, inArray, sql } from 'drizzle-orm';
import { withRead, withTx } from '@/db/tx';
import { memberships, notifications, outbox, parties, unitOccupancies, users } from '@/db/schema';
import type { AppRole } from '@/auth/context';
import { TEMPLATES, UNDISABLEABLE, type RenderedNotification, type TopicName } from '@/modules/notifications/templates';
import { sendEmail } from '@/notifications/email';
import { localHour } from '@/shared/dates';
import { allBuildings, systemContext } from './context';

const MAX_ATTEMPTS = 8;
const BATCH = 50;

/**
 * Cada 5 min — procesa el outbox: resuelve destinatarios, renderiza la
 * plantilla, crea la notificación in-app y despacha el correo.
 *
 * RN-33: lo agrupado (`digestKey`) no se manda al instante: se acumula y sale
 * una sola vez al día a las 08:00 local, en un único correo.
 */
export async function dispatchOutbox(now = new Date()): Promise<{ processed: number; sent: number; deferred: number; failed: number }> {
  let processed = 0, sent = 0, deferred = 0, failed = 0;

  for (const building of await allBuildings()) {
    const ctx = await systemContext(building.id);
    const hour = localHour(now, ctx.buildingTimezone);
    const digestWindow = hour === 8;

    const pending = await withRead((db) =>
      db.select().from(outbox)
        .where(and(eq(outbox.buildingId, building.id), eq(outbox.status, 'pending'), sql`${outbox.availableAt} <= now()`))
        .orderBy(outbox.id).limit(BATCH),
    );

    const baseUrl = process.env.APP_BASE_URL ?? 'https://dragainn.uy';
    const tplCtx = { buildingName: building.name, baseUrl };

    for (const item of pending) {
      processed += 1;
      const topic = item.topic as TopicName;
      const template = TEMPLATES[topic];

      if (!template) {
        await markFailed(ctx, item.id, `Sin plantilla para «${item.topic}»`);
        failed += 1;
        continue;
      }

      let rendered: RenderedNotification;
      try {
        rendered = (template as (c: typeof tplCtx, p: never) => RenderedNotification)(tplCtx, item.payload as never);
      } catch (err) {
        await markFailed(ctx, item.id, `Plantilla inválida: ${(err as Error).message}`);
        failed += 1;
        continue;
      }

      // RN-33: fuera de la ventana de las 08:00, lo agrupado espera.
      if (rendered.digestKey && !digestWindow) {
        await withTx(ctx, async (tx) => {
          await tx.update(outbox).set({ availableAt: nextEightAm(now, ctx.buildingTimezone) }).where(eq(outbox.id, item.id));
        });
        deferred += 1;
        continue;
      }

      const recipients = await resolveRecipients(building.id, topic, item.payload as Record<string, unknown>);
      const targets = recipients.filter((r) => canReceive(r, topic));

      const okSend = await withTx(ctx, async (tx) => {
        await tx.update(outbox).set({ status: 'processing', attempts: item.attempts + 1 }).where(eq(outbox.id, item.id));

        if (targets.length > 0) {
          await tx.insert(notifications).values(
            targets.map((r) => ({
              buildingId: building.id, userId: r.id, notifType: topic,
              title: rendered.subject, body: rendered.body,
              entityType: (item.payload as { entityType?: string }).entityType ?? null,
              channel: 'email' as const, digestKey: rendered.digestKey ?? null,
            })),
          );
        }
        return targets.length;
      });

      const result = okSend > 0
        ? await sendEmail({ to: targets.map((t) => t.email), subject: rendered.subject, text: rendered.body })
        : { sent: true };

      await withTx(ctx, async (tx) => {
        if (result.sent || okSend === 0) {
          await tx.update(outbox).set({ status: 'done', processedAt: new Date() }).where(eq(outbox.id, item.id));
          if (okSend > 0) {
            await tx.update(notifications).set({ status: 'sent', sentAt: new Date() })
              .where(and(eq(notifications.notifType, topic), inArray(notifications.userId, targets.map((t) => t.id)), eq(notifications.status, 'pending')));
          }
        } else if (item.attempts + 1 >= MAX_ATTEMPTS) {
          await tx.update(outbox).set({ status: 'failed', lastError: result.error ?? 'sin detalle' }).where(eq(outbox.id, item.id));
        } else {
          // Backoff exponencial con tope de 15 minutos
          const delayMs = Math.min(15 * 60_000, 1000 * 2 ** (item.attempts + 1));
          await tx.update(outbox)
            .set({ status: 'pending', lastError: result.error ?? null, availableAt: new Date(Date.now() + delayMs) })
            .where(eq(outbox.id, item.id));
        }
      });

      if (result.sent && okSend > 0) sent += 1;
      else if (!result.sent && okSend > 0) failed += 1;
    }
  }

  return { processed, sent, deferred, failed };
}

type Recipient = { id: string; email: string; prefs: string[]; roles: AppRole[] };

/** §8 — matriz de destinatarios por evento. */
async function resolveRecipients(buildingId: string, topic: TopicName, payload: Record<string, unknown>): Promise<Recipient[]> {
  const audience = (payload.audience as string | undefined) ?? defaultAudience(topic);

  if (audience === 'reporter') {
    const userId = payload.reportedByUserId as string | undefined;
    return userId ? byIds(buildingId, [userId]) : [];
  }

  if (audience === 'unit_owner') {
    const unitId = payload.unitId as string | undefined;
    if (!unitId) return [];
    return withRead(async (db) => {
      const rows = await db
        .select({ id: users.id, email: users.email, prefs: users.notificationPrefs })
        .from(unitOccupancies)
        .innerJoin(parties, eq(parties.id, unitOccupancies.partyId))
        .innerJoin(users, eq(users.partyId, parties.id))
        .where(and(eq(unitOccupancies.unitId, unitId), eq(unitOccupancies.role, 'owner'), sql`current_date <@ ${unitOccupancies.period}`));
      return rows.map((r) => ({ ...r, prefs: r.prefs ?? [], roles: ['owner'] as AppRole[] }));
    });
  }

  const roles = audience.split(',').filter(Boolean) as AppRole[];
  return byRoles(buildingId, roles);
}

function defaultAudience(topic: TopicName): string {
  switch (topic) {
    case 'ticket.created': return 'administrador,encargado';
    case 'ticket.status_changed': return 'reporter';
    case 'ticket.waiting_owner': return 'unit_owner';
    case 'ticket.critical': return 'administrador,comision';
    case 'incident.grave': return 'administrador';
    case 'approval.pending': return 'administrador,comision';
    case 'governance.exception': return 'comision';
    case 'compliance.day_incomplete': return 'encargado';   // RN-44: SOLO el encargado
    case 'compliance.two_days': return 'administrador';
    case 'compliance.seven_days': return 'administrador,comision';
    case 'pool.trend': return 'encargado,administrador';
    case 'checklist.omitted_item': return 'administrador';
    case 'stock.low': return 'administrador';
    case 'maintenance.overdue': return 'administrador,encargado';
    case 'expiry.upcoming': return 'administrador';
    case 'report.monthly_ready': return 'administrador,comision';
    case 'report.owners_digest': return 'owner';
    default: return 'administrador';
  }
}

async function byRoles(buildingId: string, roles: AppRole[]): Promise<Recipient[]> {
  if (roles.length === 0) return [];
  return withRead(async (db) => {
    const rows = await db
      .select({ id: users.id, email: users.email, prefs: users.notificationPrefs, role: memberships.role })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(and(eq(memberships.buildingId, buildingId), eq(memberships.isActive, true), eq(users.isActive, true), inArray(memberships.role, roles)));

    const byUser = new Map<string, Recipient>();
    for (const r of rows) {
      const existing = byUser.get(r.id);
      if (existing) existing.roles.push(r.role as AppRole);
      else byUser.set(r.id, { id: r.id, email: r.email, prefs: r.prefs ?? [], roles: [r.role as AppRole] });
    }
    return [...byUser.values()];
  });
}

async function byIds(buildingId: string, ids: string[]): Promise<Recipient[]> {
  return withRead(async (db) => {
    const rows = await db.select({ id: users.id, email: users.email, prefs: users.notificationPrefs })
      .from(users).where(and(inArray(users.id, ids), eq(users.isActive, true)));
    return rows.map((r) => ({ ...r, prefs: r.prefs ?? [], roles: [] as AppRole[] }));
  });
}

/** RN-34: el usuario apaga las no críticas; las de seguridad no se pueden apagar. */
function canReceive(r: Recipient, topic: TopicName): boolean {
  if ((UNDISABLEABLE as string[]).includes(topic)) return true;
  return !r.prefs.includes(topic);
}

function nextEightAm(now: Date, tz: string): Date {
  const hour = localHour(now, tz);
  const hoursAhead = hour < 8 ? 8 - hour : 24 - hour + 8;
  return new Date(now.getTime() + hoursAhead * 3_600_000);
}

async function markFailed(ctx: Awaited<ReturnType<typeof systemContext>>, id: number, reason: string): Promise<void> {
  await withTx(ctx, async (tx) => {
    await tx.update(outbox).set({ status: 'failed', lastError: reason, processedAt: new Date() }).where(eq(outbox.id, id));
  });
}

import { and, desc, eq, sql, type SQL } from 'drizzle-orm';
import { route } from '@/api/handler';
import { ok } from '@/api/envelope';
import { withRead } from '@/db/tx';
import { auditLog, users } from '@/db/schema';
import { assertCan } from '@/policy/can';
import { pagination } from '@/shared/schemas';

export const dynamic = 'force-dynamic';

/** RN-19: solo lectura. No hay POST, PATCH ni DELETE en esta ruta, por diseño. */
export const GET = route(async (req, ctx) => {
  assertCan(ctx, 'read', 'audit');
  const sp = req.nextUrl.searchParams;
  const { page, pageSize } = pagination.parse({ page: sp.get('page') ?? 1, pageSize: sp.get('pageSize') ?? 50 });

  const where: SQL[] = [eq(auditLog.buildingId, ctx.buildingId)];
  if (sp.get('entidad')) where.push(eq(auditLog.entityType, sp.get('entidad')!));
  if (sp.get('entidadId')) where.push(eq(auditLog.entityId, sp.get('entidadId')!));
  if (sp.get('usuario')) where.push(eq(auditLog.actorUserId, sp.get('usuario')!));
  if (sp.get('accion')) where.push(eq(auditLog.action, sp.get('accion')!));
  if (sp.get('desde')) where.push(sql`${auditLog.occurredAt} >= ${sp.get('desde')}::date`);
  if (sp.get('hasta')) where.push(sql`${auditLog.occurredAt} < (${sp.get('hasta')}::date + 1)`);

  const rows = await withRead((db) =>
    db.select({
      id: auditLog.id, occurredAt: auditLog.occurredAt, actorUserId: auditLog.actorUserId,
      actorName: users.displayName, actorRole: auditLog.actorRole, entityType: auditLog.entityType,
      entityId: auditLog.entityId, action: auditLog.action, changedFields: auditLog.changedFields,
      before: auditLog.before, after: auditLog.after, requestId: auditLog.requestId,
    })
      .from(auditLog)
      .leftJoin(users, eq(users.id, auditLog.actorUserId))
      .where(and(...where))
      .orderBy(desc(auditLog.occurredAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
  );

  // Exportación CSV: administrador, comisión y auditor.
  if (sp.get('formato') === 'csv') {
    assertCan(ctx, 'export', 'audit');
    const header = 'fecha_hora,usuario,rol,entidad,entidad_id,accion,campos_modificados,request_id';
    const body = rows.map((r) => [
      r.occurredAt?.toISOString() ?? '', csv(r.actorName), csv(r.actorRole), csv(r.entityType),
      r.entityId ?? '', csv(r.action), csv((r.changedFields ?? []).join(' ')), csv(r.requestId),
    ].join(',')).join('\n');
    return new Response(`﻿${header}\n${body}`, {
      headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="auditoria.csv"' },
    }) as never;
  }

  return ok(rows, { page, pageSize });
});

function csv(v: string | null | undefined): string {
  if (!v) return '';
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

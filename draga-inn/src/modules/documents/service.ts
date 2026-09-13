import { and, desc, eq, inArray, sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import type { Tx } from '@/db/tx';
import type { AuthContext } from '@/auth/context';
import { documentLinks, documents } from '@/db/schema';
import { assertCan, can } from '@/policy/can';
import { ForbiddenError, NotFoundError } from '@/shared/errors';
import { documentSchema } from '@/shared/schemas';
import { appendEvent } from '@/modules/cases/repo';
import { buildStoragePath, signedDownloadUrl, signedUploadUrl } from './storage';

export async function requestUploadUrl(ctx: AuthContext, filename: string, contentType: string) {
  assertCan(ctx, 'create', 'document');
  const storagePath = buildStoragePath(ctx.buildingId, filename);
  return signedUploadUrl(storagePath, contentType);
}

/** RN-17: nace `internal`. Publicar a propietarios es un acto explícito y auditado. */
export async function confirmDocument(tx: Tx, ctx: AuthContext, input: z.infer<typeof documentSchema>) {
  assertCan(ctx, 'create', 'document');
  if (input.visibility === 'owners' || input.visibility === 'public') {
    assertCan(ctx, 'publish', 'document');
  }

  const [doc] = await tx.insert(documents).values({
    buildingId: ctx.buildingId,
    title: input.title,
    docType: input.docType,
    storagePath: input.storagePath,
    mimeType: input.mimeType ?? null,
    sizeBytes: input.sizeBytes ?? null,
    checksum: input.checksum ?? null,
    issuedOn: input.issuedOn ?? null,
    expiresOn: input.expiresOn ?? null,
    visibility: input.visibility,
    uploadedBy: ctx.user.id,
    createdBy: ctx.user.id,
  }).returning();

  if (input.links.length > 0) {
    await tx.insert(documentLinks)
      .values(input.links.map((l) => ({ documentId: doc!.id, entityType: l.entityType, entityId: l.entityId })))
      .onConflictDoNothing();

    for (const link of input.links.filter((l) => l.entityType === 'case')) {
      await appendEvent(tx, ctx, {
        caseId: link.entityId, eventType: 'document_linked', entityType: 'document', entityId: doc!.id,
        note: input.title, payload: { docType: input.docType, visibility: input.visibility },
      });
    }
  }
  return doc!;
}

/** RN-17: el cambio de visibilidad es un acto propio, auditado por el trigger. */
export async function setVisibility(tx: Tx, ctx: AuthContext, documentId: string, visibility: 'internal' | 'committee' | 'owners' | 'public') {
  if (visibility === 'owners' || visibility === 'public') assertCan(ctx, 'publish', 'document');
  else assertCan(ctx, 'update', 'document');

  const [doc] = await tx.update(documents).set({ visibility })
    .where(and(eq(documents.id, documentId), eq(documents.buildingId, ctx.buildingId)))
    .returning();
  if (!doc) throw new NotFoundError('No encontramos el documento.');
  return doc;
}

export async function listDocuments(
  tx: Tx,
  ctx: AuthContext,
  f: { docType?: string; entityType?: string; entityId?: string; visibility?: string; expiringDays?: number; limit: number; offset: number },
) {
  assertCan(ctx, 'read', 'document');
  const where: SQL[] = [eq(documents.buildingId, ctx.buildingId)];

  // Un propietario o inquilino solo ve lo publicado. No ve que lo interno existe.
  if (!can(ctx, 'read', 'unit_other')) {
    where.push(inArray(documents.visibility, ['owners', 'public']));
  } else if (f.visibility) {
    where.push(sql`${documents.visibility}::text = ${f.visibility}`);
  }
  if (f.docType) where.push(eq(documents.docType, f.docType));
  if (f.expiringDays !== undefined) {
    where.push(sql`${documents.expiresOn} is not null and ${documents.expiresOn} <= current_date + ${f.expiringDays}`);
  }
  if (f.entityType && f.entityId) {
    where.push(sql`exists (
      select 1 from document_links dl
       where dl.document_id = ${documents.id}
         and dl.entity_type = ${f.entityType} and dl.entity_id = ${f.entityId}::uuid)`);
  }

  const rows = await tx.select().from(documents).where(and(...where))
    .orderBy(desc(documents.createdAt)).limit(f.limit).offset(f.offset);
  const [{ total }] = (await tx.select({ total: sql<number>`count(*)::int` }).from(documents).where(and(...where))) as [{ total: number }];
  return { rows, total };
}

/** La URL de descarga se emite solo después de verificar el permiso sobre el documento. */
export async function downloadUrl(tx: Tx, ctx: AuthContext, documentId: string) {
  const [doc] = await tx.select().from(documents)
    .where(and(eq(documents.id, documentId), eq(documents.buildingId, ctx.buildingId))).limit(1);
  if (!doc) throw new NotFoundError('No encontramos el documento.');
  if (!can(ctx, 'read', 'document', doc)) throw new ForbiddenError();
  return { ...(await signedDownloadUrl(doc.storagePath)), title: doc.title, mimeType: doc.mimeType };
}

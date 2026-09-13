import { route } from '@/api/handler';
import { created, ok } from '@/api/envelope';
import { withRead, withTx } from '@/db/tx';
import { confirmDocument, listDocuments, setVisibility } from '@/modules/documents/service';
import { documentSchema, pagination, uuid } from '@/shared/schemas';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

export const GET = route(async (req, ctx) => {
  const sp = req.nextUrl.searchParams;
  const { page, pageSize } = pagination.parse({ page: sp.get('page') ?? 1, pageSize: sp.get('pageSize') ?? 25 });
  const { rows, total } = await withRead((db) =>
    listDocuments(db, ctx, {
      docType: sp.get('tipo') ?? undefined,
      entityType: sp.get('entidad') ?? undefined,
      entityId: sp.get('entidadId') ?? undefined,
      visibility: sp.get('visibilidad') ?? undefined,
      expiringDays: sp.get('vencen') ? Number(sp.get('vencen')) : undefined,
      limit: pageSize,
      offset: (page - 1) * pageSize,
    }),
  );
  return ok(rows, { page, pageSize, total });
});

export const POST = route(async (req, ctx) => {
  const input = documentSchema.parse(await req.json());
  return created(await withTx(ctx, (tx) => confirmDocument(tx, ctx, input)));
});

const visibilitySchema = z.object({
  documentId: uuid,
  visibility: z.enum(['internal', 'committee', 'owners', 'public']),
});

/** RN-17: publicar es un acto explícito. Endpoint propio, permiso propio. */
export const PATCH = route(async (req, ctx) => {
  const input = visibilitySchema.parse(await req.json());
  return ok(await withTx(ctx, (tx) => setVisibility(tx, ctx, input.documentId, input.visibility)));
});

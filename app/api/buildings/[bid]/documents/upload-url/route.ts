import { route } from '@/api/handler';
import { ok } from '@/api/envelope';
import { requestUploadUrl } from '@/modules/documents/service';
import { uploadUrlSchema } from '@/shared/schemas';

export const dynamic = 'force-dynamic';

/** Signed URL v4 de escritura, 15 minutos, content-type fijado. */
export const POST = route(async (req, ctx) => {
  const input = uploadUrlSchema.parse(await req.json());
  return ok(await requestUploadUrl(ctx, input.filename, input.contentType));
});

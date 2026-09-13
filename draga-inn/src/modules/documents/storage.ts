import { Storage } from '@google-cloud/storage';
import { randomUUID } from 'node:crypto';

/**
 * Cloud Storage. El bucket NUNCA es público: el acceso es siempre por signed
 * URL v4 de vida corta, emitida después de verificar permisos.
 */
let storage: Storage | undefined;

function client(): Storage {
  storage ??= new Storage({ projectId: process.env.FIREBASE_PROJECT_ID });
  return storage;
}

function bucketName(): string {
  const name = process.env.GCS_BUCKET;
  if (!name) throw new Error('Falta GCS_BUCKET.');
  return name;
}

export function slugify(filename: string): string {
  return filename
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

/** Convención: buildings/{building_id}/{yyyy}/{uuid}-{slug}.{ext} */
export function buildStoragePath(buildingId: string, filename: string): string {
  const year = new Date().getUTCFullYear();
  return `buildings/${buildingId}/${year}/${randomUUID()}-${slugify(filename)}`;
}

/** Subida directa del cliente a GCS: PUT, 15 minutos, content-type fijado. */
export async function signedUploadUrl(
  storagePath: string,
  contentType: string,
): Promise<{ url: string; storagePath: string; expiresAt: string; headers: Record<string, string> }> {
  const expires = Date.now() + 15 * 60 * 1000;
  const [url] = await client()
    .bucket(bucketName())
    .file(storagePath)
    .getSignedUrl({ version: 'v4', action: 'write', expires, contentType });

  return { url, storagePath, expiresAt: new Date(expires).toISOString(), headers: { 'Content-Type': contentType } };
}

/** Descarga: 5 minutos, emitida tras verificar `can(ctx,'read','document',doc)`. */
export async function signedDownloadUrl(storagePath: string): Promise<{ url: string; expiresAt: string }> {
  const expires = Date.now() + 5 * 60 * 1000;
  const [url] = await client()
    .bucket(bucketName())
    .file(storagePath)
    .getSignedUrl({ version: 'v4', action: 'read', expires });
  return { url, expiresAt: new Date(expires).toISOString() };
}

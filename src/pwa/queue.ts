'use client';

import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

/**
 * Cola de mutaciones offline (HANDOFF §6.2).
 *
 * Principio: la UI escribe en IndexedDB y responde al instante; la red es un
 * detalle. La idempotencia la garantiza `clientUuid`: el servidor resuelve con
 * ON CONFLICT y devuelve el registro existente, así que reintentar nunca duplica.
 */
export type QueuedMutation = {
  clientUuid: string;
  endpoint: string;
  method: 'POST' | 'PATCH';
  body: unknown;
  attempts: number;
  createdAt: number;
  nextAttemptAt: number;
  status: 'pending' | 'syncing' | 'failed';
  lastError?: string;
  /** Etiqueta legible para mostrarle al encargado qué está pendiente. */
  label: string;
};

export type QueuedPhoto = {
  id: string;
  /** `clientUuid` de la mutación a la que pertenece la foto. */
  mutationUuid: string;
  filename: string;
  contentType: string;
  blob: Blob;
  attempts: number;
  status: 'pending' | 'uploading' | 'failed';
};

interface DragaDB extends DBSchema {
  mutations: { key: string; value: QueuedMutation; indexes: { 'by-status': string } };
  photos: { key: string; value: QueuedPhoto; indexes: { 'by-mutation': string } };
  cache: { key: string; value: { key: string; data: unknown; storedAt: number } };
}

const DB_NAME = 'draga-inn';
const DB_VERSION = 1;
let dbPromise: Promise<IDBPDatabase<DragaDB>> | undefined;

function db(): Promise<IDBPDatabase<DragaDB>> {
  dbPromise ??= openDB<DragaDB>(DB_NAME, DB_VERSION, {
    upgrade(database) {
      const mutations = database.createObjectStore('mutations', { keyPath: 'clientUuid' });
      mutations.createIndex('by-status', 'status');
      const photos = database.createObjectStore('photos', { keyPath: 'id' });
      photos.createIndex('by-mutation', 'mutationUuid');
      database.createObjectStore('cache', { keyPath: 'key' });
    },
  });
  return dbPromise;
}

export function newUuid(): string {
  return crypto.randomUUID();
}

export async function enqueueMutation(m: Omit<QueuedMutation, 'attempts' | 'createdAt' | 'nextAttemptAt' | 'status'>): Promise<void> {
  const database = await db();
  await database.put('mutations', {
    ...m,
    attempts: 0,
    createdAt: Date.now(),
    nextAttemptAt: Date.now(),
    status: 'pending',
  });
  notify();
}

export async function enqueuePhoto(p: Omit<QueuedPhoto, 'attempts' | 'status'>): Promise<void> {
  const database = await db();
  await database.put('photos', { ...p, attempts: 0, status: 'pending' });
  notify();
}

export async function pendingMutations(): Promise<QueuedMutation[]> {
  const database = await db();
  const all = await database.getAll('mutations');
  return all.filter((m) => m.status !== 'syncing').sort((a, b) => a.createdAt - b.createdAt);
}

export async function pendingCount(): Promise<number> {
  const database = await db();
  const all = await database.getAll('mutations');
  return all.filter((m) => m.status === 'pending' || m.status === 'failed').length;
}

export async function markSyncing(uuids: string[]): Promise<void> {
  const database = await db();
  const tx = database.transaction('mutations', 'readwrite');
  for (const uuid of uuids) {
    const m = await tx.store.get(uuid);
    if (m) await tx.store.put({ ...m, status: 'syncing' });
  }
  await tx.done;
}

export async function resolveMutation(uuid: string, outcome: 'applied' | 'duplicate' | 'error', error?: string): Promise<void> {
  const database = await db();
  if (outcome === 'applied' || outcome === 'duplicate') {
    await database.delete('mutations', uuid);
    // Las fotos de esa mutación ya no dependen de ella para su vínculo
    const photos = await database.getAllFromIndex('photos', 'by-mutation', uuid);
    for (const p of photos) if (p.status === 'pending') await database.put('photos', { ...p, status: 'pending' });
  } else {
    const m = await database.get('mutations', uuid);
    if (m) {
      const attempts = m.attempts + 1;
      // Backoff exponencial con tope de 5 minutos (HANDOFF §6.2)
      const delay = Math.min(300_000, 1000 * 2 ** attempts);
      await database.put('mutations', {
        ...m,
        attempts,
        lastError: error,
        // A los 10 intentos fallidos se marca `failed` y se le muestra al usuario
        status: attempts >= 10 ? 'failed' : 'pending',
        nextAttemptAt: Date.now() + delay,
      });
    }
  }
  notify();
}

export async function pendingPhotos(): Promise<QueuedPhoto[]> {
  const database = await db();
  const all = await database.getAll('photos');
  return all.filter((p) => p.status !== 'uploading');
}

export async function resolvePhoto(id: string, ok: boolean): Promise<void> {
  const database = await db();
  if (ok) {
    await database.delete('photos', id);
  } else {
    const p = await database.get('photos', id);
    // CB-09: a los 10 intentos la foto se marca "no enviada" y el registro queda igual
    if (p) await database.put('photos', { ...p, attempts: p.attempts + 1, status: p.attempts + 1 >= 10 ? 'failed' : 'pending' });
  }
  notify();
}

/** Caché de lectura para que la PWA funcione sin conexión. */
export async function putCache(key: string, data: unknown): Promise<void> {
  const database = await db();
  await database.put('cache', { key, data, storedAt: Date.now() });
}

export async function getCache<T>(key: string): Promise<{ data: T; storedAt: number } | null> {
  const database = await db();
  const row = await database.get('cache', key);
  return row ? { data: row.data as T, storedAt: row.storedAt } : null;
}

/** CB-03: con la cola acumulada se sigue aceptando, pero se avisa. */
export const COLA_ALERTA = 200;

const listeners = new Set<() => void>();

export function onQueueChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notify(): void {
  for (const fn of listeners) fn();
}

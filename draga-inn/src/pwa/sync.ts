'use client';

import {
  enqueueMutation, enqueuePhoto, getCache, newUuid, onQueueChange, pendingCount,
  pendingMutations, pendingPhotos, putCache, resolveMutation, resolvePhoto, markSyncing,
  type QueuedMutation,
} from './queue';
import { getIdToken } from './firebase-client';

const BATCH_SIZE = 50;
const POLL_MS = 60_000;

export type SyncState = { online: boolean; pending: number; syncing: boolean; failed: number };

let state: SyncState = { online: true, pending: 0, syncing: false, failed: 0 };
const subscribers = new Set<(s: SyncState) => void>();

export function subscribeSync(fn: (s: SyncState) => void): () => void {
  subscribers.add(fn);
  fn(state);
  return () => subscribers.delete(fn);
}

function setState(patch: Partial<SyncState>): void {
  state = { ...state, ...patch };
  for (const fn of subscribers) fn(state);
}

async function refreshCount(): Promise<void> {
  const all = await pendingMutations();
  setState({ pending: all.length, failed: all.filter((m) => m.status === 'failed').length });
}

/**
 * Envía la mutación al servidor si hay red; si no, la encola.
 * Devuelve `queued: true` cuando quedó guardada en el teléfono, para que la UI
 * pueda decir **"guardado en el teléfono, pendiente de enviar"** y nunca
 * "guardado" a secas (P2, RN-30).
 */
export async function mutate<T>(
  buildingId: string,
  endpoint: string,
  body: unknown,
  opts: { method?: 'POST' | 'PATCH'; label: string; photos?: File[] } = { label: 'Registro' },
): Promise<{ queued: boolean; data?: T; clientUuid: string }> {
  const clientUuid = newUuid();
  const method = opts.method ?? 'POST';
  const url = `/api/buildings/${buildingId}${endpoint}`;

  // RN-32: las fotos se suben aparte. El registro no espera a la foto.
  for (const file of opts.photos ?? []) {
    await enqueuePhoto({ id: newUuid(), mutationUuid: clientUuid, filename: file.name, contentType: file.type, blob: file });
  }

  if (navigator.onLine) {
    try {
      const res = await authedFetch(url, { method, body: JSON.stringify({ ...(body as object), clientUuid }) });
      if (res.ok) {
        const json = (await res.json()) as { data: T };
        void syncPhotos(buildingId);
        return { queued: false, data: json.data, clientUuid };
      }
      // 4xx que no sea de red: es un error real, no vale la pena encolarlo
      if (res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429) {
        const err = (await res.json()) as { error: { message: string; code: string } };
        throw new MutationError(err.error.message, err.error.code);
      }
    } catch (err) {
      if (err instanceof MutationError) throw err;
      // Error de red: cae a la cola
    }
  }

  await enqueueMutation({ clientUuid, endpoint: url, method, body: { ...(body as object), clientUuid }, label: opts.label });
  await refreshCount();
  return { queued: true, clientUuid };
}

export class MutationError extends Error {
  constructor(message: string, readonly code: string) {
    super(message);
    this.name = 'MutationError';
  }
}

/** Envía el lote pendiente. El servidor procesa en orden y responde por clientUuid. */
export async function flush(buildingId: string): Promise<void> {
  if (!navigator.onLine || state.syncing) return;
  const all = await pendingMutations();
  const ready = all.filter((m) => m.status === 'pending' && m.nextAttemptAt <= Date.now());
  if (ready.length === 0) {
    await syncPhotos(buildingId);
    return;
  }

  setState({ syncing: true });
  try {
    const batch = ready.slice(0, BATCH_SIZE);
    await markSyncing(batch.map((m) => m.clientUuid));

    const res = await authedFetch(`/api/buildings/${buildingId}/sync`, {
      method: 'POST',
      body: JSON.stringify({
        mutations: batch.map((m) => ({
          clientUuid: m.clientUuid, endpoint: m.endpoint, method: m.method, body: m.body, createdAt: m.createdAt,
        })),
      }),
    });

    if (!res.ok) {
      for (const m of batch) await resolveMutation(m.clientUuid, 'error', `HTTP ${res.status}`);
      return;
    }

    const json = (await res.json()) as { data: { clientUuid: string; result: 'applied' | 'duplicate' | 'error'; message?: string }[] };
    for (const r of json.data) await resolveMutation(r.clientUuid, r.result, r.message);

    await syncPhotos(buildingId);
  } finally {
    setState({ syncing: false });
    await refreshCount();
  }
}

/** Sube las fotos encoladas por signed URL y las vincula al registro. */
async function syncPhotos(buildingId: string): Promise<void> {
  if (!navigator.onLine) return;
  for (const photo of await pendingPhotos()) {
    if (photo.status === 'failed') continue;
    try {
      const urlRes = await authedFetch(`/api/buildings/${buildingId}/documents/upload-url`, {
        method: 'POST',
        body: JSON.stringify({ filename: photo.filename, contentType: photo.contentType, sizeBytes: photo.blob.size }),
      });
      if (!urlRes.ok) { await resolvePhoto(photo.id, false); continue; }
      const { data } = (await urlRes.json()) as { data: { url: string; storagePath: string } };

      const put = await fetch(data.url, { method: 'PUT', headers: { 'Content-Type': photo.contentType }, body: photo.blob });
      if (!put.ok) { await resolvePhoto(photo.id, false); continue; }

      const confirm = await authedFetch(`/api/buildings/${buildingId}/documents`, {
        method: 'POST',
        body: JSON.stringify({
          title: photo.filename, docType: 'foto', storagePath: data.storagePath,
          mimeType: photo.contentType, sizeBytes: photo.blob.size, visibility: 'internal',
          links: [{ entityType: 'sync_mutation', entityId: photo.mutationUuid }],
        }),
      });
      await resolvePhoto(photo.id, confirm.ok);
    } catch {
      await resolvePhoto(photo.id, false);
    }
  }
}

async function authedFetch(url: string, init: RequestInit): Promise<Response> {
  const token = await getIdToken();
  return fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(init.headers ?? {}) },
  });
}

/** GET con caché: si no hay red, devuelve lo guardado y dice de cuándo es (§9). */
export async function readCached<T>(buildingId: string, endpoint: string): Promise<{ data: T; fromCache: boolean; storedAt?: number }> {
  const url = `/api/buildings/${buildingId}${endpoint}`;
  if (navigator.onLine) {
    try {
      const res = await authedFetch(url, { method: 'GET' });
      if (res.ok) {
        const json = (await res.json()) as { data: T };
        await putCache(url, json.data);
        return { data: json.data, fromCache: false };
      }
    } catch {
      // cae a caché
    }
  }
  const cached = await getCache<T>(url);
  if (!cached) throw new Error('No pudimos cargar la información. Revisá tu conexión.');
  return { data: cached.data, fromCache: true, storedAt: cached.storedAt };
}

/** Arranca los disparadores de sincronización (HANDOFF §6.2). */
export function startSync(buildingId: string): () => void {
  const run = () => void flush(buildingId);

  const onOnline = () => { setState({ online: true }); run(); };
  const onOffline = () => setState({ online: false });
  const onVisible = () => { if (document.visibilityState === 'visible') run(); };

  setState({ online: navigator.onLine });
  window.addEventListener('online', onOnline);
  window.addEventListener('offline', onOffline);
  document.addEventListener('visibilitychange', onVisible);
  const timer = window.setInterval(run, POLL_MS);
  const unsub = onQueueChange(() => void refreshCount());

  void refreshCount();
  run();

  // Background Sync API cuando el navegador la soporta
  void navigator.serviceWorker?.ready
    .then((reg) => (reg as ServiceWorkerRegistration & { sync?: { register(tag: string): Promise<void> } }).sync?.register('draga-sync'))
    .catch(() => undefined);

  return () => {
    window.removeEventListener('online', onOnline);
    window.removeEventListener('offline', onOffline);
    document.removeEventListener('visibilitychange', onVisible);
    window.clearInterval(timer);
    unsub();
  };
}

export { pendingCount, type QueuedMutation };

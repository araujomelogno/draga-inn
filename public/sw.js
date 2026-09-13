/* eslint-disable */
/**
 * Service worker de la PWA del encargado.
 *
 * Estrategias:
 *  · Shell de la app y estáticos → cache-first con revalidación.
 *  · GET de la API → network-first con caída a caché (§9: "Mostrando
 *    información guardada del <fecha y hora>").
 *  · Mutaciones → NUNCA las intercepta: viven en la cola de IndexedDB, que es
 *    quien garantiza la idempotencia por client_uuid.
 */
const VERSION = 'draga-v1';
const SHELL = `${VERSION}-shell`;
const DATOS = `${VERSION}-datos`;

const PRECACHE = ['/pwa', '/pwa/piscina', '/pwa/registrar', '/pwa/cumplimiento', '/pwa/informe', '/offline', '/manifest.webmanifest'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL).then((cache) => cache.addAll(PRECACHE).catch(() => undefined)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (url.origin !== self.location.origin) return;
  // Las mutaciones las maneja la cola, no el service worker.
  if (request.method !== 'GET') return;

  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirst(request));
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(SHELL).then((c) => c.put(request, copy));
          return res;
        })
        .catch(() => caches.match(request).then((r) => r ?? caches.match('/offline'))),
    );
    return;
  }

  event.respondWith(cacheFirst(request));
});

async function networkFirst(request) {
  try {
    const res = await fetch(request);
    if (res.ok) {
      const copy = res.clone();
      const cache = await caches.open(DATOS);
      await cache.put(request, copy);
    }
    return res;
  } catch (err) {
    const cached = await caches.match(request);
    if (cached) {
      // La respuesta cacheada lleva marca para que la UI diga de cuándo es.
      const headers = new Headers(cached.headers);
      headers.set('x-draga-cache', 'hit');
      return new Response(cached.body, { status: cached.status, headers });
    }
    throw err;
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) {
    event_revalidate(request);
    return cached;
  }
  const res = await fetch(request);
  if (res.ok) {
    const copy = res.clone();
    const cache = await caches.open(SHELL);
    await cache.put(request, copy);
  }
  return res;
}

function event_revalidate(request) {
  fetch(request)
    .then((res) => { if (res.ok) caches.open(SHELL).then((c) => c.put(request, res)); })
    .catch(() => undefined);
}

/** Background Sync: la página hace el envío real; acá solo la despertamos. */
self.addEventListener('sync', (event) => {
  if (event.tag === 'draga-sync') {
    event.waitUntil(
      self.clients.matchAll({ includeUncontrolled: true, type: 'window' }).then((clients) => {
        for (const client of clients) client.postMessage({ type: 'draga:sync' });
      }),
    );
  }
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'draga:skip-waiting') self.skipWaiting();
});

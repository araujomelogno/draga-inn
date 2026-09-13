'use client';

import { useCallback, useEffect, useState } from 'react';
import { getIdToken } from '@/pwa/firebase-client';

export type Estado<T> = { datos: T | null; cargando: boolean; error: string | null; recargar: () => void };

/** Lectura simple para la consola y el portal (no offline: ahí sí hace falta red). */
export function useApi<T>(buildingId: string, endpoint: string | null): Estado<T> {
  const [datos, setDatos] = useState<T | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const recargar = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (!endpoint) { setCargando(false); return; }
    let vivo = true;
    void (async () => {
      setCargando(true);
      setError(null);
      try {
        const token = await getIdToken();
        const res = await fetch(`/api/buildings/${buildingId}${endpoint}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        const json = (await res.json()) as { data?: T; error?: { message: string } };
        if (!vivo) return;
        if (!res.ok) setError(json.error?.message ?? 'No pudimos cargar la información.');
        else setDatos(json.data ?? null);
      } catch {
        if (vivo) setError('No pudimos cargar la información. Revisá tu conexión.');
      } finally {
        if (vivo) setCargando(false);
      }
    })();
    return () => { vivo = false; };
  }, [buildingId, endpoint, nonce]);

  return { datos, cargando, error, recargar };
}

export async function enviarApi<T>(
  buildingId: string, endpoint: string, body: unknown, method: 'POST' | 'PATCH' | 'PUT' | 'DELETE' = 'POST',
): Promise<{ ok: true; data: T } | { ok: false; message: string; code: string; details?: Record<string, unknown> }> {
  const token = await getIdToken();
  const res = await fetch(`/api/buildings/${buildingId}${endpoint}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = (await res.json()) as { data?: T; error?: { message: string; code: string; details?: Record<string, unknown> } };
  if (!res.ok) {
    return { ok: false, message: json.error?.message ?? 'Algo salió mal.', code: json.error?.code ?? 'INTERNAL', details: json.error?.details };
  }
  return { ok: true, data: json.data as T };
}

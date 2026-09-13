import { cert, getApps, initializeApp, applicationDefault, type App } from 'firebase-admin/app';
import { getAuth, type DecodedIdToken } from 'firebase-admin/auth';
import { UnauthorizedError } from '@/shared/errors';

let app: App | undefined;

function adminApp(): App {
  if (app) return app;
  const existing = getApps();
  if (existing.length > 0) {
    app = existing[0]!;
    return app;
  }
  const projectId = process.env.FIREBASE_PROJECT_ID ?? process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  app = initializeApp({
    // En Cloud Run se usa la identidad del servicio (ADC): no hay credencial en el repo.
    credential: raw ? cert(JSON.parse(raw) as Record<string, string>) : applicationDefault(),
    projectId,
  });
  return app;
}

/**
 * Verifica el ID token de Firebase. `firebase-admin` cachea las claves públicas
 * de Google internamente, así que no hace falta caché propia.
 */
export async function verifyIdToken(token: string): Promise<DecodedIdToken> {
  try {
    return await getAuth(adminApp()).verifyIdToken(token, true);
  } catch {
    // Nunca detallamos por qué falló: no damos pistas sobre la existencia de cuentas.
    throw new UnauthorizedError('Tu sesión venció. Volvé a iniciar sesión.');
  }
}

export function bearerToken(header: string | null | undefined): string {
  if (!header?.startsWith('Bearer ')) {
    throw new UnauthorizedError('Tenés que iniciar sesión para continuar.');
  }
  return header.slice('Bearer '.length).trim();
}

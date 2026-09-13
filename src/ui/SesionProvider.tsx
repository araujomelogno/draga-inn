'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { User } from 'firebase/auth';
import { getIdToken, logout, watchUser } from '@/pwa/firebase-client';
import type { AppRole } from '@/auth/context';

export type Perfil = {
  user: { id: string; email: string; displayName?: string };
  buildingId: string;
  roles: AppRole[];
  roleLabels: string[];
  primaryRole?: AppRole;
  needsContextSwitch: boolean;
  unitIds: string[];
  timezone: string;
  currency: string;
  season: { isHigh: boolean; label: string; reason?: string };
  abilities: Record<string, string[]>;
};

type Estado = { cargando: boolean; user: User | null; perfil: Perfil | null; error: string | null };

const Ctx = createContext<Estado & { salir: () => Promise<void>; puede: (subject: string, action: string) => boolean }>({
  cargando: true, user: null, perfil: null, error: null,
  salir: async () => undefined,
  puede: () => false,
});

export const BUILDING_ID = process.env.NEXT_PUBLIC_BUILDING_ID ?? '11111111-1111-1111-1111-111111111111';

export function SesionProvider({ children }: { children: React.ReactNode }) {
  const [estado, setEstado] = useState<Estado>({ cargando: true, user: null, perfil: null, error: null });

  useEffect(() => {
    return watchUser(async (user) => {
      if (!user) {
        setEstado({ cargando: false, user: null, perfil: null, error: null });
        return;
      }
      try {
        const token = await getIdToken();
        const res = await fetch(`/api/buildings/${BUILDING_ID}/me`, { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) {
          const body = (await res.json()) as { error?: { message: string } };
          setEstado({ cargando: false, user, perfil: null, error: body.error?.message ?? 'No pudimos verificar tu acceso.' });
          return;
        }
        const { data } = (await res.json()) as { data: Perfil };
        setEstado({ cargando: false, user, perfil: data, error: null });
      } catch {
        setEstado({ cargando: false, user, perfil: null, error: 'No pudimos cargar la información. Revisá tu conexión.' });
      }
    });
  }, []);

  const value = useMemo(
    () => ({
      ...estado,
      salir: logout,
      // P3: la interfaz OCULTA lo que el rol no puede hacer; no lo muestra deshabilitado.
      puede: (subject: string, action: string) => Boolean(estado.perfil?.abilities[subject]?.includes(action)),
    }),
    [estado],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSesion() {
  return useContext(Ctx);
}

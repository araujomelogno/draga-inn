'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { SesionProvider, useSesion, BUILDING_ID } from '@/ui/SesionProvider';
import { BarraSync } from '@/ui/BarraSync';
import { Ingreso } from '@/ui/Ingreso';
import { Marca } from '@/ui/Marca';
import { Esqueleto } from '@/ui/estados';

export default function PwaLayout({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      void navigator.serviceWorker.register('/sw.js').catch(() => undefined);
    }
  }, []);

  return (
    <SesionProvider>
      <Contenido>{children}</Contenido>
    </SesionProvider>
  );
}

function Contenido({ children }: { children: React.ReactNode }) {
  const { cargando, user, perfil, error } = useSesion();
  const ruta = usePathname();

  if (cargando) {
    return (
      <>
        <header className="barra-superior"><Marca /></header>
        <main className="contenedor-angosto"><Esqueleto filas={6} /></main>
      </>
    );
  }

  if (!user) return <Ingreso destino="/pwa" />;

  if (!perfil) {
    return (
      <>
        <header className="barra-superior"><Marca /></header>
        <main className="contenedor-angosto">
          <div className="aviso rojo" role="alert">{error ?? 'No tenés acceso a este edificio.'}</div>
        </main>
      </>
    );
  }

  return (
    <>
      <header className="barra-superior">
        <Marca />
        <span className="crece" />
        <BarraSync buildingId={BUILDING_ID} />
      </header>

      <main id="contenido" className="contenedor-angosto">{children}</main>

      {/* Barra inferior de 4 ítems fijos (ESPEC §2.1) */}
      <nav className="barra-inferior" aria-label="Navegación principal">
        <Link href="/pwa" aria-current={ruta === '/pwa' ? 'page' : undefined}>
          <IconoHoy /> Hoy
        </Link>
        <Link href="/pwa/registrar" className="destacado" aria-current={ruta === '/pwa/registrar' ? 'page' : undefined}>
          <span className="icono-mas" aria-hidden="true"><IconoMas /></span>
          Registrar
        </Link>
        <Link href="/pwa/tickets" aria-current={ruta?.startsWith('/pwa/tickets') ? 'page' : undefined}>
          <IconoTickets /> Tickets
        </Link>
        <Link href="/pwa/informe" aria-current={ruta?.startsWith('/pwa/informe') ? 'page' : undefined}>
          <IconoInforme /> Informe
        </Link>
      </nav>
    </>
  );
}

const props = { width: 22, height: 22, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.9, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true };

function IconoHoy() { return <svg {...props}><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M8 3v4M16 3v4M3 10h18M8 15l2.5 2.5L16 12" /></svg>; }
function IconoMas() { return <svg {...props} width={22} height={22} strokeWidth={2.4}><path d="M12 5v14M5 12h14" /></svg>; }
function IconoTickets() { return <svg {...props}><path d="M4 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-4V7Z" /><path d="M13 5v14" strokeDasharray="2 3" /></svg>; }
function IconoInforme() { return <svg {...props}><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z" /><path d="M14 3v5h5M9 13h6M9 17h4" /></svg>; }

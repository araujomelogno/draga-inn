'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { SesionProvider, useSesion } from '@/ui/SesionProvider';
import { Ingreso } from '@/ui/Ingreso';
import { Marca } from '@/ui/Marca';
import { Esqueleto } from '@/ui/estados';

const ITEMS = [
  { href: '/portal', label: 'Inicio' },
  { href: '/portal/unidad', label: 'Mi unidad' },
  { href: '/portal/reclamos', label: 'Mis reclamos' },
  { href: '/portal/documentos', label: 'Documentos' },
  { href: '/portal/perfil', label: 'Perfil' },
] as const;

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <SesionProvider>
      <Portal>{children}</Portal>
    </SesionProvider>
  );
}

function Portal({ children }: { children: React.ReactNode }) {
  const { cargando, user, perfil, error, salir } = useSesion();
  const ruta = usePathname();

  if (cargando) return (<><header className="barra-superior"><Marca subtitulo="Propietarios" /></header><main className="contenedor-angosto"><Esqueleto filas={6} /></main></>);
  if (!user) return <Ingreso destino="/portal" />;
  if (!perfil) {
    return (<><header className="barra-superior"><Marca subtitulo="Propietarios" /></header>
      <main className="contenedor-angosto"><div className="aviso rojo" role="alert">{error ?? 'No tenés acceso a este edificio.'}</div></main></>);
  }

  return (
    <>
      <header className="barra-superior">
        <Marca subtitulo="Propietarios" />
        <span className="crece" />
        <button type="button" className="boton sutil" style={{ color: '#fff' }} onClick={() => void salir()}>Salir</button>
      </header>

      <nav className="pestanas" style={{ padding: '0 1rem', background: 'var(--superficie)' }} aria-label="Secciones">
        {ITEMS.map((i) => (
          <Link key={i.href} href={i.href}
            aria-current={ruta === i.href || (i.href !== '/portal' && ruta?.startsWith(i.href)) ? 'page' : undefined}>
            {i.label}
          </Link>
        ))}
      </nav>

      <main id="contenido" className="contenedor-angosto">{children}</main>
    </>
  );
}

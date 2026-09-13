'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { SesionProvider, useSesion } from '@/ui/SesionProvider';
import { Ingreso } from '@/ui/Ingreso';
import { Marca } from '@/ui/Marca';
import { Esqueleto } from '@/ui/estados';

/** ESPEC §2.2 — Navegación de la consola. P3: lo que el rol no puede, no se muestra. */
const MENU = [
  { titulo: null, items: [{ href: '/admin', label: 'Tablero', requiere: null }] },
  {
    titulo: 'Operación',
    items: [
      { href: '/admin/tickets', label: 'Tickets', requiere: ['ticket', 'read'] },
      { href: '/admin/expedientes', label: 'Expedientes', requiere: ['case', 'read'] },
      { href: '/admin/mantenimiento', label: 'Tareas de mantenimiento', requiere: ['maintenance_task', 'read'] },
    ],
  },
  {
    titulo: 'Edificio',
    items: [
      { href: '/admin/unidades', label: 'Unidades', requiere: ['unit_other', 'read'] },
      { href: '/admin/activos', label: 'Activos', requiere: ['asset', 'read'] },
    ],
  },
  {
    titulo: 'Contrataciones',
    items: [
      { href: '/admin/proveedores', label: 'Proveedores', requiere: ['vendor', 'read'] },
      { href: '/admin/aprobaciones', label: 'Aprobaciones', requiere: ['approval_below', 'read'] },
      { href: '/admin/facturas', label: 'Facturas', requiere: ['invoice', 'read'] },
    ],
  },
  {
    titulo: 'Registros',
    items: [
      { href: '/admin/planillas', label: 'Planillas del encargado', requiere: ['logbook', 'read'] },
      { href: '/admin/informes', label: 'Informes mensuales', requiere: ['monthly_report', 'read'] },
      { href: '/admin/documentos', label: 'Documentos', requiere: ['document', 'read'] },
      { href: '/admin/decisiones', label: 'Decisiones', requiere: ['decision', 'read'] },
    ],
  },
  {
    titulo: 'Control',
    items: [
      { href: '/admin/cumplimiento', label: 'Cumplimiento', requiere: ['compliance_building', 'read'] },
      { href: '/admin/auditoria', label: 'Auditoría', requiere: ['audit', 'read'] },
    ],
  },
  {
    titulo: 'Configuración',
    items: [{ href: '/admin/configuracion', label: 'Reglas y plantillas', requiere: ['governance_rule', 'read'] }],
  },
] as const;

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <SesionProvider>
      <Consola>{children}</Consola>
    </SesionProvider>
  );
}

function Consola({ children }: { children: React.ReactNode }) {
  const { cargando, user, perfil, error, salir, puede } = useSesion();
  const ruta = usePathname();

  if (cargando) {
    return (<><header className="barra-superior"><Marca subtitulo="Administración" /></header><main className="contenedor"><Esqueleto filas={6} /></main></>);
  }
  if (!user) return <Ingreso destino="/admin" />;
  if (!perfil) {
    return (<><header className="barra-superior"><Marca subtitulo="Administración" /></header>
      <main className="contenedor"><div className="aviso rojo" role="alert">{error ?? 'No tenés acceso a este edificio.'}</div></main></>);
  }

  return (
    <>
      <header className="barra-superior">
        <Marca subtitulo="Administración" />
        <span className="crece" />
        {perfil.season.isHigh ? <span className="etiqueta ambar">{perfil.season.label}</span> : null}
        <span style={{ fontSize: '.85rem' }}>{perfil.user.displayName ?? perfil.user.email} · {perfil.roleLabels.join(', ')}</span>
        <button type="button" className="boton sutil" style={{ color: '#fff' }} onClick={() => void salir()}>Salir</button>
      </header>

      <div className="disposicion-consola">
        <nav className="lateral" aria-label="Secciones">
          {MENU.map((grupo, i) => {
            const visibles = grupo.items.filter((it) => !it.requiere || puede(it.requiere[0], it.requiere[1]));
            if (visibles.length === 0) return null;
            return (
              <div className="grupo" key={grupo.titulo ?? i}>
                {grupo.titulo ? <p className="titulo">{grupo.titulo}</p> : null}
                {visibles.map((it) => (
                  <Link key={it.href} href={it.href}
                    aria-current={ruta === it.href || (it.href !== '/admin' && ruta?.startsWith(it.href)) ? 'page' : undefined}>
                    {it.label}
                  </Link>
                ))}
              </div>
            );
          })}
        </nav>
        <main id="contenido" className="contenedor">{children}</main>
      </div>
    </>
  );
}

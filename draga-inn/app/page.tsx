import Link from 'next/link';
import { Marca } from '@/ui/Marca';

export default function Inicio() {
  return (
    <>
      <header className="barra-superior">
        <Marca />
      </header>
      <main id="contenido" className="contenedor-angosto">
        <h1>Sistema de Gestión y Gobernanza</h1>
        <p style={{ color: 'var(--texto-suave)' }}>
          Edificio Draga Inn · Punta del Este, Maldonado
        </p>

        <div className="grilla" style={{ marginTop: '1.5rem' }}>
          <Link className="tarjeta" href="/pwa" style={{ textDecoration: 'none', color: 'inherit' }}>
            <h2>Encargado</h2>
            <p style={{ color: 'var(--texto-suave)', marginBottom: 0 }}>
              Planillas, tickets y cumplimiento. Funciona sin conexión.
            </p>
          </Link>
          <Link className="tarjeta" href="/admin" style={{ textDecoration: 'none', color: 'inherit' }}>
            <h2>Administración</h2>
            <p style={{ color: 'var(--texto-suave)', marginBottom: 0 }}>
              Tablero, expedientes, contrataciones y auditoría.
            </p>
          </Link>
          <Link className="tarjeta" href="/portal" style={{ textDecoration: 'none', color: 'inherit' }}>
            <h2>Propietarios</h2>
            <p style={{ color: 'var(--texto-suave)', marginBottom: 0 }}>
              Tu unidad, tus reclamos y los documentos del edificio.
            </p>
          </Link>
        </div>
      </main>
    </>
  );
}

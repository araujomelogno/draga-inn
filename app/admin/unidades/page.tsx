'use client';

import Link from 'next/link';
import { BUILDING_ID } from '@/ui/SesionProvider';
import { useApi } from '@/ui/datos';
import { Esqueleto, ErrorDeRed, Vacio } from '@/ui/estados';

type Unidad = {
  id: string; code: string; unit_type: string; floor: string | null; coefficient: string | null;
  owner_name: string | null; tenant_name: string | null; open_tickets: number; incomplete: boolean;
};

const TIPOS: Record<string, string> = { apartment: 'Apartamento', parking: 'Cochera', storage: 'Baulera', commercial: 'Comercial', common: 'Común' };

export default function Unidades() {
  const { datos, cargando, error, recargar } = useApi<Unidad[]>(BUILDING_ID, '/units');

  if (cargando) return <Esqueleto filas={10} />;
  if (error) return <ErrorDeRed onReintentar={recargar} />;
  if (!datos || datos.length === 0) return <Vacio titulo="Todavía no hay unidades cargadas." detalle="El padrón se carga con el seed o desde la configuración." />;

  const incompletas = datos.filter((u) => u.incomplete && u.unit_type === 'apartment').length;

  return (
    <>
      <h1>Unidades</h1>
      {/* CB-12: unidad sin propietario vigente se marca, no se oculta */}
      {incompletas > 0 ? (
        <div className="aviso ambar">
          <strong>{incompletas} unidad{incompletas > 1 ? 'es' : ''} sin titular vigente</strong>
          Están marcadas abajo y también aparecen en el tablero de riesgos.
        </div>
      ) : null}

      <div className="tarjeta tabla-scroll">
        <table className="tabla">
          <thead>
            <tr><th>Código</th><th>Tipo</th><th>Piso</th><th>Coeficiente</th><th>Propietario vigente</th><th>Inquilino vigente</th><th>Reclamos abiertos</th></tr>
          </thead>
          <tbody>
            {datos.map((u) => (
              <tr key={u.id}>
                <td><Link href={`/admin/unidades/${u.id}`}>{u.code}</Link></td>
                <td>{TIPOS[u.unit_type] ?? u.unit_type}</td>
                <td>{u.floor ?? '—'}</td>
                <td className="num">{u.coefficient ? `${Number(u.coefficient).toFixed(4)} %` : '—'}</td>
                <td>{u.owner_name ?? (u.unit_type === 'apartment' ? <span className="etiqueta ambar">Sin cargar</span> : '—')}</td>
                <td>{u.tenant_name ?? '—'}</td>
                <td className="num">{u.open_tickets > 0 ? <span className="etiqueta neutra">{u.open_tickets}</span> : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

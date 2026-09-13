'use client';

import { BUILDING_ID } from '@/ui/SesionProvider';
import { useApi } from '@/ui/datos';
import { Esqueleto, ErrorDeRed, Vacio } from '@/ui/estados';

export type Columna<T> = { clave: string; titulo: string; render: (fila: T) => React.ReactNode; num?: boolean };

/** Listado con los cuatro estados de §9 resueltos en un solo lugar. */
export function Listado<T extends { id?: string | number }>({
  titulo, endpoint, columnas, vacio, acciones, aviso, filaClase,
}: {
  titulo: string;
  endpoint: string;
  columnas: Columna<T>[];
  vacio: { titulo: string; detalle?: string; accion?: React.ReactNode };
  acciones?: React.ReactNode;
  aviso?: React.ReactNode;
  filaClase?: (fila: T) => string | undefined;
}) {
  const { datos, cargando, error, recargar } = useApi<T[]>(BUILDING_ID, endpoint);

  return (
    <>
      <div className="entre">
        <h1>{titulo}</h1>
        {acciones}
      </div>
      {aviso}

      {cargando ? <Esqueleto filas={8} /> : null}
      {error ? <ErrorDeRed onReintentar={recargar} /> : null}
      {datos && datos.length === 0 ? <Vacio {...vacio} /> : null}

      {datos && datos.length > 0 ? (
        <div className="tarjeta tabla-scroll">
          <table className="tabla">
            <caption className="visualmente-oculto">{titulo}</caption>
            <thead>
              <tr>{columnas.map((c) => <th key={c.clave}>{c.titulo}</th>)}</tr>
            </thead>
            <tbody>
              {datos.map((fila, i) => (
                <tr key={String(fila.id ?? i)} className={filaClase?.(fila)}>
                  {columnas.map((c) => (
                    <td key={c.clave} className={c.num ? 'num' : undefined}>{c.render(fila)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </>
  );
}

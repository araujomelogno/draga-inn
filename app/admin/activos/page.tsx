'use client';

import { Listado } from '@/ui/Listado';
import { formatDate } from '@/shared/format';

type Activo = { id: string; name: string; category: string; location: string | null; criticality: string; status: string; warrantyUntil: string | null; serialNumber: string | null };

const CRIT: Record<string, string> = { low: 'Baja', normal: 'Normal', critical: 'Crítica' };

export default function Activos() {
  return (
    <Listado<Activo>
      titulo="Activos"
      endpoint="/assets"
      vacio={{ titulo: 'Todavía no hay activos cargados.', detalle: 'El inventario inicial se carga con el seed o desde la consola.' }}
      columnas={[
        { clave: 'name', titulo: 'Nombre', render: (a) => <a href={`/admin/activos/${a.id}`}>{a.name}</a> },
        { clave: 'category', titulo: 'Categoría', render: (a) => a.category },
        { clave: 'location', titulo: 'Ubicación', render: (a) => a.location ?? '—' },
        { clave: 'criticality', titulo: 'Criticidad', render: (a) => (
          <span className={`etiqueta ${a.criticality === 'critical' ? 'roja' : 'neutra'}`}>{CRIT[a.criticality] ?? a.criticality}</span>
        ) },
        { clave: 'warranty', titulo: 'Garantía', render: (a) => (a.warrantyUntil ? formatDate(a.warrantyUntil) : '—') },
        { clave: 'serial', titulo: 'N.º de serie', render: (a) => a.serialNumber ?? '—' },
      ]}
    />
  );
}

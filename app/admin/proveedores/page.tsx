'use client';

import { Listado } from '@/ui/Listado';
import { formatDate } from '@/shared/format';

type Proveedor = { id: string; legalName: string; tradeName: string | null; taxId: string | null; email: string | null; phone: string | null; services: string[]; status: string; contractUntil: string | null };

export default function Proveedores() {
  return (
    <Listado<Proveedor>
      titulo="Proveedores"
      endpoint="/vendors?activos=0"
      aviso={
        <div className="aviso info">
          Un proveedor con trabajos registrados no se elimina: se desactiva y el histórico se conserva.
        </div>
      }
      vacio={{ titulo: 'Todavía no hay proveedores cargados.' }}
      columnas={[
        { clave: 'name', titulo: 'Razón social', render: (v) => v.legalName },
        { clave: 'trade', titulo: 'Nombre comercial', render: (v) => v.tradeName ?? '—' },
        { clave: 'tax', titulo: 'RUT', render: (v) => v.taxId ?? '—' },
        { clave: 'contacto', titulo: 'Contacto', render: (v) => [v.email, v.phone].filter(Boolean).join(' · ') || '—' },
        { clave: 'servicios', titulo: 'Servicios', render: (v) => v.services.join(', ') || '—' },
        { clave: 'contrato', titulo: 'Contrato hasta', render: (v) => (v.contractUntil ? formatDate(v.contractUntil) : '—') },
        { clave: 'estado', titulo: 'Estado', render: (v) => (
          <span className={`etiqueta ${v.status === 'active' ? '' : 'neutra'}`}>{v.status === 'active' ? 'Activo' : 'Desactivado'}</span>
        ) },
      ]}
    />
  );
}

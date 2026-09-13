'use client';

import { Listado } from '@/ui/Listado';
import { formatDate, formatMoney } from '@/shared/format';

type Factura = { id: string; number: string; issue_date: string; amount: string; currency: string; status: string; vendor_name: string; category: string | null; work_order_number: number | null };

const ESTADOS: Record<string, string> = { received: 'Recibida', validated: 'Validada', rejected: 'Rechazada', paid: 'Pagada' };

export default function Facturas() {
  return (
    <Listado<Factura>
      titulo="Facturas"
      endpoint="/invoices"
      aviso={
        <div className="aviso info">
          El v1 registra y valida facturas. Pagos y conciliación quedan para el v2.
        </div>
      }
      vacio={{ titulo: 'Todavía no hay facturas cargadas.' }}
      columnas={[
        { clave: 'number', titulo: 'N.º', render: (f) => f.number },
        { clave: 'fecha', titulo: 'Fecha', render: (f) => formatDate(f.issue_date) },
        { clave: 'proveedor', titulo: 'Proveedor', render: (f) => f.vendor_name },
        { clave: 'ot', titulo: 'Orden', render: (f) => (f.work_order_number ? `OT #${f.work_order_number}` : '—') },
        { clave: 'rubro', titulo: 'Rubro', render: (f) => f.category ?? 'Sin rubro' },
        { clave: 'monto', titulo: 'Monto', num: true, render: (f) => formatMoney(f.amount, f.currency) },
        { clave: 'estado', titulo: 'Estado', render: (f) => (
          <span className={`etiqueta ${f.status === 'validated' ? '' : f.status === 'rejected' ? 'roja' : 'ambar'}`}>
            {ESTADOS[f.status] ?? f.status}
          </span>
        ) },
      ]}
    />
  );
}

'use client';

import { Listado } from '@/ui/Listado';
import { formatDateTime } from '@/shared/format';
import { CASE_STATUS_LABELS, type CaseStatus } from '@/policy/transitions';

type Expediente = { id: string; number: number; title: string; status: CaseStatus; category: string | null; openedAt: string };

export default function Expedientes() {
  return (
    <Listado<Expediente>
      titulo="Expedientes"
      endpoint="/cases"
      aviso={<div className="aviso info">Todo hecho pertenece a un expediente: tickets, presupuestos, órdenes y facturas cuelgan de acá.</div>}
      vacio={{ titulo: 'Todavía no hay expedientes abiertos.' }}
      columnas={[
        { clave: 'number', titulo: 'N.º', render: (c) => <a href={`/admin/expedientes/${c.id}`}>#{c.number}</a> },
        { clave: 'title', titulo: 'Asunto', render: (c) => c.title },
        { clave: 'categoria', titulo: 'Categoría', render: (c) => c.category ?? '—' },
        { clave: 'estado', titulo: 'Estado', render: (c) => <span className="etiqueta neutra">{CASE_STATUS_LABELS[c.status]}</span> },
        { clave: 'abierto', titulo: 'Abierto el', render: (c) => formatDateTime(c.openedAt) },
      ]}
    />
  );
}

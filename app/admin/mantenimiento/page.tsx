'use client';

import { Listado } from '@/ui/Listado';
import { formatDate } from '@/shared/format';

type Tarea = { id: string; title: string; dueDate: string; status: string; assetName: string | null; isOverdue: boolean };

const ESTADOS: Record<string, string> = { pending: 'Pendiente', done: 'Hecha', overdue: 'Vencida', skipped: 'Salteada' };

export default function Mantenimiento() {
  return (
    <Listado<Tarea>
      titulo="Tareas de mantenimiento"
      endpoint="/maintenance/tasks?estado=pending&estado=overdue"
      aviso={
        <div className="aviso info">
          Una tarea pasa a «Vencida» a las 00:00 del día siguiente a su fecha prevista.
        </div>
      }
      vacio={{ titulo: 'No hay tareas pendientes.', detalle: 'El job diario materializa las tareas de los planes activos para los próximos 60 días.' }}
      filaClase={(t) => (t.isOverdue ? 'vencido' : undefined)}
      columnas={[
        { clave: 'title', titulo: 'Tarea', render: (t) => t.title },
        { clave: 'activo', titulo: 'Activo', render: (t) => t.assetName ?? '—' },
        { clave: 'vence', titulo: 'Vence', render: (t) => formatDate(t.dueDate) },
        { clave: 'estado', titulo: 'Estado', render: (t) => (
          <span className={`etiqueta ${t.status === 'overdue' ? 'roja' : t.status === 'done' ? '' : 'neutra'}`}>{ESTADOS[t.status] ?? t.status}</span>
        ) },
      ]}
    />
  );
}

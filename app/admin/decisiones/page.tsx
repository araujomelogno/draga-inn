'use client';

import { Listado } from '@/ui/Listado';
import { formatDate } from '@/shared/format';

type Decision = { id: string; title: string; decidedOn: string; decidedBy: string; status: string; dueDate: string | null };

const ORGANOS: Record<string, string> = { comision: 'Comisión', asamblea: 'Asamblea', administrador: 'Administrador' };
const ESTADOS: Record<string, string> = { pending: 'Pendiente', in_progress: 'En curso', done: 'Ejecutada', cancelled: 'Cancelada' };

export default function Decisiones() {
  return (
    <Listado<Decision>
      titulo="Decisiones"
      endpoint="/decisions"
      vacio={{ titulo: 'Todavía no hay decisiones registradas.', detalle: 'Acá se registra lo que resolvió la comisión o la asamblea, con su responsable y su plazo.' }}
      columnas={[
        { clave: 'title', titulo: 'Decisión', render: (d) => d.title },
        { clave: 'organo', titulo: 'Órgano', render: (d) => ORGANOS[d.decidedBy] ?? d.decidedBy },
        { clave: 'fecha', titulo: 'Decidida el', render: (d) => formatDate(d.decidedOn) },
        { clave: 'plazo', titulo: 'Plazo', render: (d) => (d.dueDate ? formatDate(d.dueDate) : '—') },
        { clave: 'estado', titulo: 'Estado', render: (d) => (
          <span className={`etiqueta ${d.status === 'done' ? '' : d.status === 'cancelled' ? 'neutra' : 'ambar'}`}>{ESTADOS[d.status] ?? d.status}</span>
        ) },
      ]}
    />
  );
}

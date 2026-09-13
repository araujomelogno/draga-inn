'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { BUILDING_ID } from '@/ui/SesionProvider';
import { useApi } from '@/ui/datos';
import { Esqueleto, ErrorDeRed, SinResultados, Vacio } from '@/ui/estados';
import { formatAge, formatDate, formatDateTime } from '@/shared/format';
import { TICKET_STATUS_LABELS, type TicketStatus } from '@/policy/transitions';
import { TICKET_CATEGORY_LABELS, TICKET_PRIORITY_LABELS } from '@/shared/schemas';

type Fila = {
  id: string; number: number; title: string; category: string; priority: keyof typeof TICKET_PRIORITY_LABELS;
  status: TicketStatus; unitId: string | null; unitCode: string | null;
  assigneeName: string | null; dueDate: string | null; createdAt: string; updatedAt: string; isOverdue: boolean;
};

const CLAVE_FILTROS = 'draga:filtros:tickets';

/** ESPEC §5.2 — Bandeja. Vencidos primero, prioridad desc, antigüedad. */
export default function BandejaTickets() {
  const [filtros, setFiltros] = useState({ estado: 'abiertos', prioridad: '', categoria: '', vencidos: false, sinAsignar: false });

  // El último filtro usado persiste por usuario
  useEffect(() => {
    try {
      const guardado = localStorage.getItem(CLAVE_FILTROS);
      if (guardado) setFiltros(JSON.parse(guardado) as typeof filtros);
    } catch { /* sin persistencia si el navegador la bloquea */ }
  }, []);

  useEffect(() => {
    try { localStorage.setItem(CLAVE_FILTROS, JSON.stringify(filtros)); } catch { /* ignorar */ }
  }, [filtros]);

  const query = useMemo(() => {
    const p = new URLSearchParams();
    if (filtros.estado) p.append('estado', filtros.estado);
    if (filtros.prioridad) p.append('prioridad', filtros.prioridad);
    if (filtros.categoria) p.append('categoria', filtros.categoria);
    if (filtros.vencidos) p.set('vencidos', '1');
    if (filtros.sinAsignar) p.set('sinAsignar', '1');
    return `/tickets?${p.toString()}`;
  }, [filtros]);

  const { datos, cargando, error, recargar } = useApi<Fila[]>(BUILDING_ID, query);
  const hayFiltros = filtros.prioridad !== '' || filtros.categoria !== '' || filtros.vencidos || filtros.sinAsignar || filtros.estado !== 'abiertos';

  return (
    <>
      <div className="entre">
        <h1>Tickets</h1>
        <Link className="boton" href="/pwa/ticket">Nuevo ticket</Link>
      </div>

      <div className="tarjeta" style={{ marginBottom: '1rem' }}>
        <div className="fila">
          <select aria-label="Estado" value={filtros.estado} onChange={(e) => setFiltros((f) => ({ ...f, estado: e.target.value }))} style={{ width: 'auto' }}>
            <option value="abiertos">Abiertos</option>
            <option value="">Todos</option>
            {(Object.keys(TICKET_STATUS_LABELS) as TicketStatus[]).map((s) => (
              <option key={s} value={s}>{TICKET_STATUS_LABELS[s]}</option>
            ))}
          </select>
          <select aria-label="Prioridad" value={filtros.prioridad} onChange={(e) => setFiltros((f) => ({ ...f, prioridad: e.target.value }))} style={{ width: 'auto' }}>
            <option value="">Toda prioridad</option>
            {Object.entries(TICKET_PRIORITY_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <select aria-label="Categoría" value={filtros.categoria} onChange={(e) => setFiltros((f) => ({ ...f, categoria: e.target.value }))} style={{ width: 'auto' }}>
            <option value="">Toda categoría</option>
            {Object.entries(TICKET_CATEGORY_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <label className="fila" style={{ gap: '.35rem' }}>
            <input type="checkbox" checked={filtros.vencidos} onChange={(e) => setFiltros((f) => ({ ...f, vencidos: e.target.checked }))} style={{ width: 20, minHeight: 20 }} />
            Solo vencidos
          </label>
          <label className="fila" style={{ gap: '.35rem' }}>
            <input type="checkbox" checked={filtros.sinAsignar} onChange={(e) => setFiltros((f) => ({ ...f, sinAsignar: e.target.checked }))} style={{ width: 20, minHeight: 20 }} />
            Solo sin asignar
          </label>
        </div>
      </div>

      {cargando ? <Esqueleto filas={8} /> : null}
      {error ? <ErrorDeRed onReintentar={recargar} /> : null}

      {datos && datos.length === 0 && hayFiltros ? (
        <SinResultados onLimpiar={() => setFiltros({ estado: 'abiertos', prioridad: '', categoria: '', vencidos: false, sinAsignar: false })} />
      ) : null}

      {datos && datos.length === 0 && !hayFiltros ? (
        <Vacio titulo="No hay tickets abiertos." detalle="Cuando el encargado o un propietario registre algo, va a aparecer acá."
          accion={<Link className="boton" href="/pwa/ticket">Crear ticket</Link>} />
      ) : null}

      {datos && datos.length > 0 ? (
        <div className="tarjeta tabla-scroll">
          <table className="tabla">
            <caption className="visualmente-oculto">Tickets del edificio</caption>
            <thead>
              <tr>
                <th>N.º</th><th>Título</th><th>Unidad / área</th><th>Categoría</th>
                <th>Prioridad</th><th>Estado</th><th>Responsable</th><th>Antigüedad</th><th>Última actualización</th>
              </tr>
            </thead>
            <tbody>
              {datos.map((t) => (
                <tr key={t.id} className={t.isOverdue ? 'vencido' : undefined}>
                  <td><Link href={`/admin/tickets/${t.id}`}>#{t.number}</Link></td>
                  <td>{t.title}</td>
                  <td>{t.unitCode ?? 'Área común'}</td>
                  <td>{TICKET_CATEGORY_LABELS[t.category as keyof typeof TICKET_CATEGORY_LABELS] ?? t.category}</td>
                  <td>
                    <span className={`etiqueta ${t.priority === 'critical' ? 'roja' : t.priority === 'high' ? 'ambar' : 'neutra'}`}>
                      {TICKET_PRIORITY_LABELS[t.priority]}
                    </span>
                  </td>
                  <td><span className="etiqueta neutra">{TICKET_STATUS_LABELS[t.status]}</span></td>
                  <td>{t.assigneeName ?? <span style={{ color: 'var(--rojo-texto)', fontWeight: 600 }}>Sin asignar</span>}</td>
                  <td>{formatAge(t.createdAt)}{t.isOverdue && t.dueDate ? ` · vencía ${formatDate(t.dueDate)}` : ''}</td>
                  <td>{formatDateTime(t.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </>
  );
}

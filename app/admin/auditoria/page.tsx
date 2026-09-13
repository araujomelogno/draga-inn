'use client';

import { useState } from 'react';
import { BUILDING_ID, useSesion } from '@/ui/SesionProvider';
import { useApi } from '@/ui/datos';
import { Esqueleto, ErrorDeRed, SinPermiso, Vacio } from '@/ui/estados';
import { formatDateTime } from '@/shared/format';
import { getIdToken } from '@/pwa/firebase-client';

type Registro = {
  id: number; occurredAt: string; actorUserId: string | null; actorName: string | null; actorRole: string | null;
  entityType: string; entityId: string | null; action: string; changedFields: string[] | null;
  before: Record<string, unknown> | null; after: Record<string, unknown> | null; requestId: string | null;
};

const ACCIONES: Record<string, string> = { INSERT: 'Alta', UPDATE: 'Modificación', DELETE: 'Baja' };

/** ESPEC §5.9 — RN-19: solo lectura para todos, sin excepción. No hay edición ni borrado. */
export default function Auditoria() {
  const { puede } = useSesion();
  const [entidad, setEntidad] = useState('');
  const [accion, setAccion] = useState('');
  const [abierto, setAbierto] = useState<number | null>(null);

  const query = `/audit?${new URLSearchParams({ ...(entidad ? { entidad } : {}), ...(accion ? { accion } : {}) }).toString()}`;
  const { datos, cargando, error, recargar } = useApi<Registro[]>(BUILDING_ID, query);

  if (!puede('audit', 'read')) return <SinPermiso />;

  async function exportar() {
    const token = await getIdToken();
    const res = await fetch(`/api/buildings/${BUILDING_ID}${query}&formato=csv`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'auditoria.csv'; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <div className="entre">
        <h1>Auditoría</h1>
        {puede('audit', 'export') ? <button type="button" className="boton secundario" onClick={() => void exportar()}>Exportar CSV</button> : null}
      </div>

      <div className="aviso info">
        La auditoría la escribe la base de datos con triggers, no la aplicación. Es de solo lectura para todos los roles:
        no se edita ni se borra desde ninguna pantalla.
      </div>

      <div className="tarjeta" style={{ marginBottom: '1rem' }}>
        <div className="fila">
          <select aria-label="Entidad" value={entidad} onChange={(e) => setEntidad(e.target.value)} style={{ width: 'auto' }}>
            <option value="">Toda entidad</option>
            {['tickets', 'cases', 'quotes', 'approvals', 'work_orders', 'invoices', 'units', 'unit_occupancies', 'documents', 'memberships', 'governance_rules', 'monthly_reports'].map((e) => (
              <option key={e} value={e}>{e}</option>
            ))}
          </select>
          <select aria-label="Acción" value={accion} onChange={(e) => setAccion(e.target.value)} style={{ width: 'auto' }}>
            <option value="">Toda acción</option>
            {Object.entries(ACCIONES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
      </div>

      {cargando ? <Esqueleto filas={10} /> : null}
      {error ? <ErrorDeRed onReintentar={recargar} /> : null}
      {datos && datos.length === 0 ? <Vacio titulo="No hay registros de auditoría con estos filtros." /> : null}

      {datos && datos.length > 0 ? (
        <div className="tarjeta tabla-scroll">
          <table className="tabla">
            <thead>
              <tr><th>Fecha y hora</th><th>Usuario</th><th>Rol</th><th>Entidad</th><th>Acción</th><th>Campos modificados</th><th /></tr>
            </thead>
            <tbody>
              {datos.map((r) => (
                <>
                  <tr key={r.id}>
                    <td>{formatDateTime(r.occurredAt)}</td>
                    <td>{r.actorName ?? (r.actorUserId ? 'Usuario eliminado' : 'Sistema')}</td>
                    <td>{r.actorRole ?? '—'}</td>
                    <td><code>{r.entityType}</code></td>
                    <td>{ACCIONES[r.action] ?? r.action}</td>
                    <td>{(r.changedFields ?? []).join(', ') || '—'}</td>
                    <td>
                      <button type="button" className="boton sutil" onClick={() => setAbierto(abierto === r.id ? null : r.id)}>
                        {abierto === r.id ? 'Ocultar' : 'Ver detalle'}
                      </button>
                    </td>
                  </tr>
                  {abierto === r.id ? (
                    <tr key={`${r.id}-d`}>
                      <td colSpan={7} style={{ background: 'var(--verde-050)' }}>
                        <table className="tabla" style={{ background: 'transparent' }}>
                          <thead><tr><th>Campo</th><th>Valor anterior</th><th>Valor nuevo</th></tr></thead>
                          <tbody>
                            {(r.changedFields ?? Object.keys(r.after ?? {})).map((campo) => (
                              <tr key={campo}>
                                <td><code>{campo}</code></td>
                                <td>{mostrar(r.before?.[campo])}</td>
                                <td>{mostrar(r.after?.[campo])}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {r.requestId ? <p style={{ fontSize: '.8rem', color: 'var(--texto-suave)' }}>Request: <code>{r.requestId}</code></p> : null}
                      </td>
                    </tr>
                  ) : null}
                </>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </>
  );
}

function mostrar(v: unknown): string {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

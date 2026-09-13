'use client';

import { useState } from 'react';
import Link from 'next/link';
import { BUILDING_ID } from '@/ui/SesionProvider';
import { useApi } from '@/ui/datos';
import { Esqueleto, ErrorDeRed, Vacio } from '@/ui/estados';
import { formatDateTime, formatMoney } from '@/shared/format';
import { ROLE_LABELS } from '@/auth/context';
import type { AppRole } from '@/auth/context';

type Fila = {
  id: string; case_id: string; case_number: number; case_title: string;
  subject_type: string; decision: string; approved_amount: string | null; currency: string | null;
  approver_role: AppRole; decided_at: string; rationale: string | null;
  is_exception: boolean; exception_reason: string | null; approver_name: string | null; rule_name: string | null;
};

export default function Aprobaciones() {
  const [soloExcepciones, setSoloExcepciones] = useState(false);
  const { datos, cargando, error, recargar } = useApi<Fila[]>(BUILDING_ID, `/approvals${soloExcepciones ? '?excepciones=1' : ''}`);

  if (cargando) return <Esqueleto filas={8} />;
  if (error) return <ErrorDeRed onReintentar={recargar} />;

  return (
    <>
      <h1>Aprobaciones</h1>

      <div className="tarjeta" style={{ marginBottom: '1rem' }}>
        <label className="fila" style={{ gap: '.4rem' }}>
          <input type="checkbox" checked={soloExcepciones} onChange={(e) => setSoloExcepciones(e.target.checked)} style={{ width: 20, minHeight: 20 }} />
          Solo excepciones de gobernanza
        </label>
      </div>

      {!datos || datos.length === 0 ? (
        <Vacio titulo={soloExcepciones ? 'No hay excepciones de gobernanza registradas.' : 'Todavía no hay aprobaciones registradas.'} />
      ) : (
        <div className="tarjeta tabla-scroll">
          <table className="tabla">
            <thead>
              <tr><th>Fecha</th><th>Expediente</th><th>Sobre</th><th>Decisión</th><th>Monto</th><th>Quién</th><th>Regla</th><th>Fundamento</th></tr>
            </thead>
            <tbody>
              {datos.map((a) => (
                <tr key={a.id} style={a.is_exception ? { background: 'var(--ambar-fondo)' } : undefined}>
                  <td>{formatDateTime(a.decided_at)}</td>
                  <td><Link href={`/admin/expedientes/${a.case_id}`}>#{a.case_number}</Link></td>
                  <td>{a.subject_type}</td>
                  <td>
                    <span className={`etiqueta ${a.is_exception ? 'ambar' : a.decision === 'approved' ? '' : 'roja'}`}>
                      {a.is_exception ? 'Excepción' : a.decision === 'approved' ? 'Aprobado' : 'Rechazado'}
                    </span>
                  </td>
                  <td className="num">{a.approved_amount ? formatMoney(a.approved_amount, a.currency ?? 'UYU') : '—'}</td>
                  <td>{a.approver_name ?? 'Sistema'}<br /><span style={{ fontSize: '.8rem', color: 'var(--texto-suave)' }}>{ROLE_LABELS[a.approver_role]}</span></td>
                  <td>{a.rule_name ?? '—'}</td>
                  <td>{a.is_exception ? a.exception_reason : a.rationale}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

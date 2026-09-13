'use client';

import { BUILDING_ID, useSesion } from '@/ui/SesionProvider';
import { useApi } from '@/ui/datos';
import { Esqueleto, ErrorDeRed, SinPermiso } from '@/ui/estados';
import { formatMoney } from '@/shared/format';
import { ROLE_LABELS, type AppRole } from '@/auth/context';

type Regla = { id: string; name: string; thresholdAmount: string; currency: string; minQuotes: number; requiredApproverRole: AppRole; active: boolean };

/** ESPEC §5.10 — Configuración. Configurar reglas de gobernanza es privativo de la comisión. */
export default function Configuracion() {
  const { puede } = useSesion();
  const { datos, cargando, error, recargar } = useApi<Regla[]>(BUILDING_ID, '/governance-rules');

  if (!puede('governance_rule', 'read')) return <SinPermiso />;

  return (
    <>
      <h1>Configuración</h1>

      <section className="tarjeta">
        <h2>Reglas de gobernanza</h2>
        <p style={{ color: 'var(--texto-suave)' }}>
          Definen, según el monto, cuántos presupuestos hacen falta y qué rol tiene que aprobar antes de emitir una orden de trabajo.
          Se aplica la regla activa con el umbral más alto que no supere el monto.
        </p>

        {cargando ? <Esqueleto filas={4} /> : null}
        {error ? <ErrorDeRed onReintentar={recargar} /> : null}

        {datos ? (
          <div className="tabla-scroll">
            <table className="tabla">
              <thead><tr><th>Regla</th><th>Desde</th><th>Presupuestos mínimos</th><th>Aprueba</th></tr></thead>
              <tbody>
                {datos.map((r) => (
                  <tr key={r.id}>
                    <td>{r.name}</td>
                    <td className="num">{formatMoney(r.thresholdAmount, r.currency)}</td>
                    <td className="num">{r.minQuotes}</td>
                    <td>{ROLE_LABELS[r.requiredApproverRole]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        {!puede('governance_rule', 'create') ? (
          <p className="ayuda">Estas reglas las configura la Comisión.</p>
        ) : null}
      </section>

      <section className="tarjeta">
        <h2>Parámetros del edificio</h2>
        <p style={{ color: 'var(--texto-suave)' }}>
          Los rangos de piscina, las fechas de temporada, la tolerancia de facturación y los plazos de cierre automático
          viven en la configuración del edificio, no en el código. Se editan en <code>buildings.settings</code>.
        </p>
      </section>
    </>
  );
}

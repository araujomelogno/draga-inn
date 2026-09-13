'use client';

import Link from 'next/link';
import { BUILDING_ID } from '@/ui/SesionProvider';
import { useApi } from '@/ui/datos';
import { Esqueleto, ErrorDeRed, LeyendaCumplimiento } from '@/ui/estados';
import { formatDate } from '@/shared/format';

type Indicador = { key: string; label: string; value: number | string; href: string; tone: 'neutral' | 'warning' | 'danger' };
type Bloque = {
  key: string; title: string; indicators: Indicador[];
  framing?: { title: string; legend: string };
  poolSparkline?: { date: string; poolLogged: boolean | null; poolOutOfRange: boolean | null }[];
};
type Tablero = { today: string; season: { isHigh: boolean; label: string; reason?: string }; blocks: Bloque[]; lowStock: number };

/** ESPEC §5.1 — Tablero. Cada tarjeta navega al listado filtrado. */
export default function Tablero() {
  const { datos, cargando, error, recargar } = useApi<Tablero>(BUILDING_ID, '/dashboard');

  if (cargando) return <Esqueleto filas={10} />;
  if (error) return <ErrorDeRed onReintentar={recargar} />;
  if (!datos) return null;

  const leyenda = datos.blocks.find((b) => b.framing)?.framing?.legend;

  return (
    <>
      <div className="entre">
        <h1>Tablero</h1>
        <span className={`etiqueta ${datos.season.isHigh ? 'ambar' : 'neutra'}`}>
          {formatDate(datos.today)} · {datos.season.label}
        </span>
      </div>

      {datos.blocks.map((bloque) => {
        const todoEnCero = bloque.indicators.every((i) => i.value === 0 || i.value === '0');
        return (
          <section key={bloque.key} style={{ marginTop: '1.5rem' }}>
            <h2>{bloque.title}</h2>

            {bloque.indicators.length === 0 || (todoEnCero && bloque.key !== 'cumplimiento') ? (
              // Estado vacío con marca de verificación, no una tarjeta en blanco
              <div className="tarjeta" style={{ display: 'flex', alignItems: 'center', gap: '.6rem', color: 'var(--verde-700)' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M20 6 9 17l-5-5" />
                </svg>
                <strong>Todo al día</strong>
              </div>
            ) : (
              <div className="grilla">
                {bloque.indicators.map((i) => (
                  <Link key={i.key} href={i.href}
                    className={`indicador ${i.tone === 'danger' ? 'peligro' : i.tone === 'warning' ? 'alerta' : ''}`}>
                    <span className="valor">{i.value}</span>
                    <span className="rotulo">{i.label}</span>
                  </Link>
                ))}
              </div>
            )}

            {/* Miniatura de tendencia de piscina: los huecos se ven */}
            {bloque.poolSparkline ? (
              <div className="tarjeta" style={{ marginTop: '.75rem' }}>
                <p style={{ fontSize: '.85rem', color: 'var(--texto-suave)', marginBottom: '.4rem' }}>
                  Registro de piscina, últimos 30 días
                </p>
                <div className="serie" style={{ height: 44 }}>
                  {bloque.poolSparkline.map((d) => (
                    <span key={d.date} className={`punto ${d.poolLogged === false ? 'hueco' : d.poolOutOfRange ? 'fuera' : ''}`}
                      title={`${formatDate(d.date)}: ${d.poolLogged === null ? 'fuera de temporada' : d.poolLogged ? (d.poolOutOfRange ? 'fuera de rango' : 'en rango') : 'sin registro'}`}>
                      {d.poolLogged ? <span className="barra" style={{ height: d.poolOutOfRange ? '55%' : '100%' }} /> : null}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
          </section>
        );
      })}

      {/* RN-51 */}
      {leyenda ? <LeyendaCumplimiento texto={leyenda} /> : null}
    </>
  );
}

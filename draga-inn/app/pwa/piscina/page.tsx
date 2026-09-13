'use client';

import { useEffect, useState } from 'react';
import { BUILDING_ID, useSesion } from '@/ui/SesionProvider';
import { Campo, Resultado, useEnvio } from '@/ui/formulario';
import { MutationError, mutate, readCached } from '@/pwa/sync';
import { evaluateReading, poolRanges, POOL_PARAMS, type PoolParam, type ReadingState } from '@/shared/pool';
import { formatDate } from '@/shared/format';
import { localDate } from '@/shared/dates';

type PoolLog = {
  id: string; loggedOn: string; freeChlorine: string | null; ph: string | null;
  alkalinity: string | null; calciumHardness: string | null; outOfRange: boolean; observations: string | null;
};

/** ESPEC §4.3 — Piscina (Anexo A). Offline completo. */
export default function Piscina() {
  const { perfil } = useSesion();
  const rangos = poolRanges(perfil ? undefined : undefined);
  const hoy = localDate(new Date(), perfil?.timezone ?? 'America/Montevideo');

  const [fecha, setFecha] = useState(hoy);
  const [hora, setHora] = useState(() => new Date().toTimeString().slice(0, 5));
  const [valores, setValores] = useState<Record<PoolParam, string>>({ freeChlorine: '', ph: '', alkalinity: '', calciumHardness: '' });
  const [desnatado, setDesnatado] = useState(true);
  const [cestas, setCestas] = useState(true);
  const [productos, setProductos] = useState('');
  const [observaciones, setObservaciones] = useState('');
  const [motivoAtraso, setMotivoAtraso] = useState('');
  const [recientes, setRecientes] = useState<PoolLog[]>([]);
  const { enviando, setEnviando, estado, setEstado, errores, setErrores } = useEnvio();

  useEffect(() => {
    void readCached<PoolLog[]>(BUILDING_ID, '/pool-logs').then((r) => setRecientes(r.data)).catch(() => undefined);
  }, []);

  const numeros = Object.fromEntries(
    POOL_PARAMS.map((p) => [p, valores[p].trim() === '' ? null : Number(valores[p].replace(',', '.'))]),
  ) as Record<PoolParam, number | null>;

  const estados = Object.fromEntries(POOL_PARAMS.map((p) => [p, evaluateReading(p, numeros[p])])) as Record<PoolParam, ReadingState>;
  const fueraDeRango = POOL_PARAMS.filter((p) => estados[p] === 'out_of_range' || estados[p] === 'critical');
  const criticos = POOL_PARAMS.filter((p) => estados[p] === 'critical');
  const diasAtras = Math.round((Date.parse(`${hoy}T00:00:00Z`) - Date.parse(`${fecha}T00:00:00Z`)) / 86_400_000);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setErrores({});
    setEstado(null);

    const errs: Record<string, string> = {};
    if (numeros.freeChlorine === null) errs.freeChlorine = 'El cloro libre es obligatorio.';
    if (numeros.ph === null) errs.ph = 'El pH es obligatorio.';
    // RN-21: fuera de rango ⇒ observación obligatoria
    if (fueraDeRango.length > 0 && observaciones.trim().length < 5) {
      errs.observations = `${fueraDeRango.map((p) => rangos[p].label).join(' y ')} ${fueraDeRango.length === 1 ? 'está' : 'están'} fuera de rango. Escribí qué hiciste.`;
    }
    // CB-02: más de 7 días atrás exige justificación
    if (diasAtras > 7 && motivoAtraso.trim().length < 5) {
      errs.backdateReason = `Estás cargando un registro de hace ${diasAtras} días. Contá por qué se carga ahora.`;
    }
    if (Object.keys(errs).length > 0) { setErrores(errs); return; }

    setEnviando(true);
    try {
      const res = await mutate<{ log: PoolLog; ticketId: string | null }>(
        BUILDING_ID,
        '/pool-logs',
        {
          loggedOn: fecha,
          loggedAt: new Date(`${fecha}T${hora}:00`).toISOString(),
          ...numeros,
          skimmed: desnatado,
          basketsCleaned: cestas,
          productsApplied: productos || null,
          observations: observaciones || null,
          backdateReason: motivoAtraso || null,
        },
        { label: `Piscina ${formatDate(fecha)}` },
      );

      if (res.queued) {
        setEstado({ tipo: 'encolado', mensaje: 'Se va a enviar apenas vuelva la señal. No se pierde nada.' });
      } else {
        setEstado({
          tipo: 'ok',
          mensaje: 'Medición registrada.',
          // RN-22: el ticket crítico se avisa acá mismo
          detalle: res.data?.ticketId ? 'Se abrió un ticket crítico por el valor fuera de rango.' : undefined,
        });
      }
      setValores({ freeChlorine: '', ph: '', alkalinity: '', calciumHardness: '' });
      setObservaciones('');
      setProductos('');
    } catch (err) {
      setEstado({ tipo: 'error', mensaje: err instanceof MutationError ? err.message : 'No pudimos guardar la medición.' });
    } finally {
      setEnviando(false);
    }
  }

  return (
    <>
      <h1>Piscina</h1>
      <p style={{ color: 'var(--texto-suave)' }}>Anexo A del Manual · control diario</p>

      <Resultado estado={estado} />

      {criticos.length > 0 ? (
        <div className="aviso rojo" role="alert">
          <strong>Valor fuera de rango crítico</strong>
          Al guardar se va a abrir un ticket crítico vinculado a esta medición.
        </div>
      ) : null}

      <form className="tarjeta" onSubmit={enviar} noValidate>
        <div className="fila">
          <div style={{ flex: 1, minWidth: 140 }}>
            <Campo label="Fecha" htmlFor="fecha" error={errores.loggedOn}>
              <input id="fecha" type="date" value={fecha} max={hoy} onChange={(e) => setFecha(e.target.value)} />
            </Campo>
          </div>
          <div style={{ flex: 1, minWidth: 120 }}>
            <Campo label="Hora" htmlFor="hora">
              <input id="hora" type="time" value={hora} onChange={(e) => setHora(e.target.value)} />
            </Campo>
          </div>
        </div>

        {diasAtras > 7 ? (
          <Campo label="Motivo de la carga tardía" htmlFor="motivo" error={errores.backdateReason}
            ayuda={`Estás cargando un registro de hace ${diasAtras} días.`}>
            <textarea id="motivo" value={motivoAtraso} onChange={(e) => setMotivoAtraso(e.target.value)} />
          </Campo>
        ) : null}

        {POOL_PARAMS.map((p) => (
          <Campo
            key={p}
            label={`${rangos[p].label}${p === 'freeChlorine' || p === 'ph' ? ' *' : ''}`}
            htmlFor={p}
            error={errores[p]}
            ayuda={`Rango de referencia: ${rangos[p].min}–${rangos[p].max}${rangos[p].unit ? ` ${rangos[p].unit}` : ''}`}
          >
            <input
              id={p}
              type="text"
              inputMode="decimal"
              value={valores[p]}
              aria-invalid={estados[p] === 'critical' || estados[p] === 'out_of_range' ? true : undefined}
              className={estados[p] === 'critical' ? 'valor-critico' : estados[p] === 'out_of_range' ? 'valor-fuera' : undefined}
              onChange={(e) => setValores((v) => ({ ...v, [p]: e.target.value }))}
            />
          </Campo>
        ))}

        <div className="fila" style={{ marginBottom: '1rem' }}>
          <label style={{ display: 'flex', gap: '.5rem', alignItems: 'center', minHeight: 44 }}>
            <input type="checkbox" checked={desnatado} onChange={(e) => setDesnatado(e.target.checked)} style={{ width: 24, height: 24, minHeight: 24 }} />
            Desnatado
          </label>
          <label style={{ display: 'flex', gap: '.5rem', alignItems: 'center', minHeight: 44 }}>
            <input type="checkbox" checked={cestas} onChange={(e) => setCestas(e.target.checked)} style={{ width: 24, height: 24, minHeight: 24 }} />
            Cestas vaciadas
          </label>
        </div>

        <Campo label="Productos aplicados" htmlFor="productos">
          <input id="productos" type="text" value={productos} onChange={(e) => setProductos(e.target.value)} />
        </Campo>

        <Campo
          label={`Observaciones${fueraDeRango.length > 0 ? ' *' : ''}`}
          htmlFor="observaciones"
          error={errores.observations}
          ayuda={fueraDeRango.length > 0 ? 'Obligatoria: hay un valor fuera de rango.' : undefined}
        >
          <textarea id="observaciones" value={observaciones} onChange={(e) => setObservaciones(e.target.value)} />
        </Campo>

        <button className="boton ancho grande" type="submit" disabled={enviando}>
          {enviando ? 'Guardando…' : 'Guardar medición'}
        </button>
      </form>

      {/* Las últimas 3 mediciones, para dar contexto */}
      {recientes.length > 0 ? (
        <section className="tarjeta">
          <h2>Últimas mediciones</h2>
          <div className="tabla-scroll">
            <table className="tabla">
              <thead>
                <tr><th>Fecha</th><th>Cloro</th><th>pH</th><th>Alcalinidad</th></tr>
              </thead>
              <tbody>
                {recientes.map((r) => (
                  <tr key={r.id}>
                    <td>{formatDate(r.loggedOn)}</td>
                    <td className="num">{r.freeChlorine ?? '—'}</td>
                    <td className="num">{r.ph ?? '—'}</td>
                    <td className="num">{r.alkalinity ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </>
  );
}

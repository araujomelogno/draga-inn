'use client';

import { useCallback, useEffect, useState } from 'react';
import { BUILDING_ID } from '@/ui/SesionProvider';
import { Campo, Resultado, useEnvio } from '@/ui/formulario';
import { MutationError, mutate, readCached } from '@/pwa/sync';
import { Esqueleto, ErrorDeRed, Vacio } from '@/ui/estados';

type Item = { id: string; name: string; unitOfMeasure: string | null; minQuantity: string; currentQuantity: string; belowMinimum: boolean };

/** ESPEC §4.6 — Stock (Anexo E). Los que están bajo el mínimo, primero y en ámbar. */
export default function Stock() {
  const [items, setItems] = useState<Item[] | null>(null);
  const [error, setError] = useState(false);
  const [abierto, setAbierto] = useState<string | null>(null);
  const [tipo, setTipo] = useState<'in' | 'out' | 'adjust'>('out');
  const [cantidad, setCantidad] = useState('');
  const [motivo, setMotivo] = useState('');
  const { enviando, setEnviando, estado, setEstado, errores, setErrores } = useEnvio();

  const cargar = useCallback(async () => {
    try {
      const r = await readCached<Item[]>(BUILDING_ID, '/stock');
      setItems(r.data);
      setError(false);
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => { void cargar(); }, [cargar]);

  async function registrar(e: React.FormEvent) {
    e.preventDefault();
    setErrores({});
    if (!cantidad || Number(cantidad.replace(',', '.')) <= 0) {
      setErrores({ quantity: 'La cantidad tiene que ser mayor que cero.' });
      return;
    }
    setEnviando(true);
    try {
      const item = items?.find((i) => i.id === abierto);
      const res = await mutate(
        BUILDING_ID,
        '/stock-movements',
        { stockItemId: abierto, kind: tipo, quantity: Number(cantidad.replace(',', '.')), reason: motivo || null },
        { label: `Stock: ${item?.name ?? ''}` },
      );
      setEstado(res.queued
        ? { tipo: 'encolado', mensaje: 'Se enviará al recuperar señal.' }
        : { tipo: 'ok', mensaje: 'Movimiento registrado.' });
      setAbierto(null); setCantidad(''); setMotivo('');
      await cargar();
    } catch (err) {
      setEstado({ tipo: 'error', mensaje: err instanceof MutationError ? err.message : 'No pudimos registrar el movimiento.' });
    } finally {
      setEnviando(false);
    }
  }

  if (!items && error) return <ErrorDeRed onReintentar={() => void cargar()} />;
  if (!items) return <Esqueleto filas={6} />;

  return (
    <>
      <h1>Stock</h1>
      <p style={{ color: 'var(--texto-suave)' }}>Anexo E del Manual</p>
      <Resultado estado={estado} />

      {items.length === 0 ? (
        <Vacio titulo="Todavía no hay insumos cargados." detalle="El administrador puede darlos de alta desde la consola." />
      ) : null}

      {items.map((i) => (
        <section key={i.id} className="tarjeta" style={i.belowMinimum ? { borderLeft: '4px solid var(--ambar-borde)', background: 'var(--ambar-fondo)' } : undefined}>
          <div className="entre">
            <div>
              <h2 style={{ marginBottom: '.1rem' }}>{i.name}</h2>
              <p style={{ margin: 0, fontSize: '.88rem', color: 'var(--texto-suave)' }}>
                {i.currentQuantity} {i.unitOfMeasure ?? ''} · mínimo {i.minQuantity}
              </p>
            </div>
            {i.belowMinimum ? <span className="etiqueta ambar">Bajo mínimo</span> : null}
          </div>

          {abierto === i.id ? (
            <form onSubmit={registrar} style={{ marginTop: '.85rem' }} noValidate>
              <Campo label="Movimiento" htmlFor={`tipo-${i.id}`}>
                <select id={`tipo-${i.id}`} value={tipo} onChange={(e) => setTipo(e.target.value as typeof tipo)}>
                  <option value="out">Salida (se usó)</option>
                  <option value="in">Entrada (se compró)</option>
                  <option value="adjust">Ajuste (recuento)</option>
                </select>
              </Campo>
              <Campo label={tipo === 'adjust' ? 'Cantidad real contada' : 'Cantidad'} htmlFor={`cant-${i.id}`} error={errores.quantity}>
                <input id={`cant-${i.id}`} type="text" inputMode="decimal" value={cantidad} onChange={(e) => setCantidad(e.target.value)} />
              </Campo>
              <Campo label="Motivo" htmlFor={`mot-${i.id}`}>
                <input id={`mot-${i.id}`} type="text" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
              </Campo>
              <div className="fila">
                <button className="boton" type="submit" disabled={enviando}>{enviando ? 'Guardando…' : 'Registrar'}</button>
                <button className="boton secundario" type="button" onClick={() => setAbierto(null)}>Cancelar</button>
              </div>
            </form>
          ) : (
            <button className="boton secundario ancho" type="button" style={{ marginTop: '.7rem' }} onClick={() => { setAbierto(i.id); setEstado(null); }}>
              Registrar movimiento
            </button>
          )}
        </section>
      ))}
    </>
  );
}

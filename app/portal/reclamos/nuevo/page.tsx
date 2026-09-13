'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { BUILDING_ID, useSesion } from '@/ui/SesionProvider';
import { enviarApi } from '@/ui/datos';
import { Campo, Resultado, useEnvio } from '@/ui/formulario';
import { TICKET_CATEGORY_LABELS } from '@/shared/schemas';

export default function NuevoReclamo() {
  const router = useRouter();
  const { perfil } = useSesion();
  const [categoria, setCategoria] = useState<keyof typeof TICKET_CATEGORY_LABELS | ''>('');
  const [descripcion, setDescripcion] = useState('');
  const [enMiUnidad, setEnMiUnidad] = useState(true);
  const { enviando, setEnviando, estado, setEstado, errores, setErrores } = useEnvio();

  const unidad = perfil?.unitIds[0] ?? null;

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setErrores({});
    const errs: Record<string, string> = {};
    if (!categoria) errs.category = 'Elegí una categoría.';
    if (descripcion.trim().length < 10) errs.description = 'Contanos qué pasa con al menos 10 caracteres.';
    if (Object.keys(errs).length > 0) { setErrores(errs); return; }

    setEnviando(true);
    const r = await enviarApi<{ number: number }>(BUILDING_ID, '/tickets', {
      description: descripcion.trim(),
      category: categoria,
      unitId: enMiUnidad ? unidad : null,
      source: 'portal',
      clientUuid: crypto.randomUUID(),
    });
    setEnviando(false);

    if (r.ok) {
      setEstado({ tipo: 'ok', mensaje: `Reclamo #${r.data.number} registrado.`, detalle: 'Te vamos a avisar por correo cada vez que cambie de estado.' });
      setTimeout(() => router.push('/portal/reclamos'), 1500);
    } else {
      setEstado({ tipo: 'error', mensaje: r.message });
    }
  }

  return (
    <>
      <h1>Nuevo reclamo</h1>
      <Resultado estado={estado} />

      <form className="tarjeta" onSubmit={enviar} noValidate>
        <div className="campo">
          <label htmlFor="ubicacion">¿Dónde es?</label>
          <div id="ubicacion" className="fila">
            {unidad ? (
              <label className="fila" style={{ gap: '.4rem' }}>
                <input type="radio" name="ubic" checked={enMiUnidad} onChange={() => setEnMiUnidad(true)} />
                En mi unidad
              </label>
            ) : null}
            <label className="fila" style={{ gap: '.4rem' }}>
              <input type="radio" name="ubic" checked={!enMiUnidad} onChange={() => setEnMiUnidad(false)} />
              En un área común
            </label>
          </div>
        </div>

        <div className="campo">
          <label htmlFor="cat-grid">Categoría</label>
          <div id="cat-grid" role="radiogroup" aria-label="Categoría"
            style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(112px, 1fr))', gap: '.5rem' }}>
            {Object.entries(TICKET_CATEGORY_LABELS).map(([v, l]) => (
              <button key={v} type="button" role="radio" aria-checked={categoria === v}
                className={`boton ${categoria === v ? '' : 'secundario'}`} style={{ fontSize: '.85rem' }}
                onClick={() => setCategoria(v as keyof typeof TICKET_CATEGORY_LABELS)}>{l}</button>
            ))}
          </div>
          {errores.category ? <p className="error" role="alert">{errores.category}</p> : null}
        </div>

        <Campo label="Contanos qué pasa" htmlFor="descripcion" error={errores.description}>
          <textarea id="descripcion" rows={5} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
        </Campo>

        <button className="boton ancho" type="submit" disabled={enviando}>
          {enviando ? 'Enviando…' : 'Enviar reclamo'}
        </button>
      </form>
    </>
  );
}

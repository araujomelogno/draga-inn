'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { BUILDING_ID } from '@/ui/SesionProvider';
import { Campo, Resultado, useEnvio } from '@/ui/formulario';
import { MutationError, mutate } from '@/pwa/sync';
import { TICKET_CATEGORY_LABELS } from '@/shared/schemas';

const CATEGORIAS = Object.entries(TICKET_CATEGORY_LABELS) as [keyof typeof TICKET_CATEGORY_LABELS, string][];
const MAX_FOTOS = 5;
const LADO_MAX = 1920;

/** ESPEC §4.2 — Nuevo ticket. Meta: ≤ 30 segundos. */
export default function NuevoTicket() {
  const router = useRouter();
  const [fotos, setFotos] = useState<File[]>([]);
  const [categoria, setCategoria] = useState<keyof typeof TICKET_CATEGORY_LABELS | ''>('');
  const [descripcion, setDescripcion] = useState('');
  const [prioridad, setPrioridad] = useState<'low' | 'normal' | 'high' | 'critical'>('normal');
  const { enviando, setEnviando, estado, setEstado, errores, setErrores } = useEnvio();

  async function agregarFotos(files: FileList | null) {
    if (!files) return;
    const nuevas: File[] = [];
    for (const file of Array.from(files).slice(0, MAX_FOTOS - fotos.length)) {
      if (file.size > 25 * 1024 * 1024) {
        setErrores((e) => ({ ...e, fotos: 'Cada foto puede pesar hasta 25 MB.' }));
        continue;
      }
      // Se redimensiona en el cliente antes de subir: 1920 px, JPEG q=0.8
      nuevas.push(await redimensionar(file));
    }
    setFotos((f) => [...f, ...nuevas].slice(0, MAX_FOTOS));
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setErrores({});
    setEstado(null);

    const errs: Record<string, string> = {};
    if (!categoria) errs.category = 'Elegí una categoría.';
    if (descripcion.trim().length < 10) errs.description = 'Contá qué pasa con al menos 10 caracteres.';
    if (Object.keys(errs).length > 0) { setErrores(errs); return; }

    setEnviando(true);
    try {
      const res = await mutate<{ number: number; id: string }>(
        BUILDING_ID,
        '/tickets',
        { description: descripcion.trim(), category: categoria, priority: prioridad, source: 'pwa' },
        { label: `Ticket: ${descripcion.slice(0, 40)}`, photos: fotos },
      );

      if (res.queued) {
        setEstado({ tipo: 'encolado', mensaje: 'Se enviará al recuperar señal.' });
      } else {
        setEstado({ tipo: 'ok', mensaje: `Ticket #${res.data?.number} creado.` });
        setTimeout(() => router.push('/pwa/tickets'), 1200);
      }
      setDescripcion('');
      setFotos([]);
      setCategoria('');
    } catch (err) {
      setEstado({ tipo: 'error', mensaje: err instanceof MutationError ? err.message : 'No pudimos crear el ticket.' });
    } finally {
      setEnviando(false);
    }
  }

  return (
    <>
      <h1>Nuevo ticket</h1>
      <Resultado estado={estado} />

      <form className="tarjeta" onSubmit={enviar} noValidate>
        {/* 1. Foto */}
        <Campo label="Fotos (opcional)" htmlFor="fotos" error={errores.fotos}
          ayuda={`Hasta ${MAX_FOTOS}. Se envían aparte: el ticket no espera a la foto.`}>
          <input id="fotos" type="file" accept="image/*" capture="environment" multiple
            onChange={(e) => void agregarFotos(e.target.files)} />
          {fotos.length > 0 ? (
            <div className="fila" style={{ marginTop: '.5rem' }}>
              {fotos.map((f, i) => (
                <span key={i} className="etiqueta neutra">
                  {f.name.slice(0, 18)}
                  <button type="button" className="boton sutil" aria-label={`Quitar ${f.name}`}
                    onClick={() => setFotos((prev) => prev.filter((_, j) => j !== i))}>×</button>
                </span>
              ))}
            </div>
          ) : null}
        </Campo>

        {/* 2. Categoría, en grilla de toque grande */}
        <div className="campo">
          <label htmlFor="categoria-grid">Categoría *</label>
          <div id="categoria-grid" role="radiogroup" aria-label="Categoría"
            style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(104px, 1fr))', gap: '.5rem' }}>
            {CATEGORIAS.map(([valor, etiqueta]) => (
              <button
                key={valor}
                type="button"
                role="radio"
                aria-checked={categoria === valor}
                className={`boton ${categoria === valor ? '' : 'secundario'}`}
                style={{ fontSize: '.85rem', padding: '.5rem .4rem' }}
                onClick={() => setCategoria(valor)}
              >
                {etiqueta}
              </button>
            ))}
          </div>
          {errores.category ? <p className="error" role="alert">{errores.category}</p> : null}
        </div>

        {/* 3. Descripción (el dictado lo provee el teclado del sistema) */}
        <Campo label="¿Qué pasa? *" htmlFor="descripcion" error={errores.description}
          ayuda={`${descripcion.trim().length}/10 caracteres mínimos`}>
          <textarea id="descripcion" value={descripcion} onChange={(e) => setDescripcion(e.target.value)}
            placeholder="Contá qué viste y dónde" />
        </Campo>

        <Campo label="Prioridad" htmlFor="prioridad">
          <select id="prioridad" value={prioridad} onChange={(e) => setPrioridad(e.target.value as typeof prioridad)}>
            <option value="low">Baja</option>
            <option value="normal">Normal</option>
            <option value="high">Alta</option>
            <option value="critical">Crítica</option>
          </select>
        </Campo>

        <button className="boton ancho grande" type="submit" disabled={enviando || descripcion.trim().length < 10 || !categoria}>
          {enviando ? 'Enviando…' : 'Enviar'}
        </button>
        {descripcion.trim().length > 0 && descripcion.trim().length < 10 ? (
          <p className="ayuda" style={{ textAlign: 'center' }}>Faltan {10 - descripcion.trim().length} caracteres para poder enviar.</p>
        ) : null}
      </form>
    </>
  );
}

/** Redimensiona a 1920 px de lado mayor, JPEG q=0.8, antes de encolar la foto. */
async function redimensionar(file: File): Promise<File> {
  if (!file.type.startsWith('image/')) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const escala = Math.min(1, LADO_MAX / Math.max(bitmap.width, bitmap.height));
    if (escala === 1 && file.size < 2 * 1024 * 1024) return file;

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * escala);
    canvas.height = Math.round(bitmap.height * escala);
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.8));
    if (!blob) return file;
    return new File([blob], file.name.replace(/\.\w+$/, '.jpg'), { type: 'image/jpeg' });
  } catch {
    return file;
  }
}

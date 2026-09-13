'use client';

import { useState } from 'react';

export function Campo({
  label, htmlFor, error, ayuda, children,
}: { label: string; htmlFor: string; error?: string | null; ayuda?: string; children: React.ReactNode }) {
  return (
    <div className="campo">
      <label htmlFor={htmlFor}>{label}</label>
      {children}
      {ayuda ? <p className="ayuda">{ayuda}</p> : null}
      {/* §9: el mensaje va al pie del campo, en español, diciendo qué corregir */}
      {error ? <p className="error" role="alert">{error}</p> : null}
    </div>
  );
}

/**
 * Resultado de un envío. P2: cuando quedó encolado lo decimos con todas las
 * letras — "guardado en el teléfono, pendiente de enviar", nunca "guardado".
 */
export function Resultado({ estado }: { estado: { tipo: 'ok' | 'encolado' | 'error'; mensaje: string; detalle?: string } | null }) {
  if (!estado) return null;
  if (estado.tipo === 'encolado') {
    return (
      <div className="aviso ambar" role="status">
        <strong>Guardado en el teléfono, pendiente de enviar</strong>
        {estado.mensaje}
      </div>
    );
  }
  if (estado.tipo === 'error') {
    return <div className="aviso rojo" role="alert"><strong>{estado.mensaje}</strong>{estado.detalle}</div>;
  }
  return <div className="aviso verde" role="status"><strong>{estado.mensaje}</strong>{estado.detalle}</div>;
}

export function useEnvio() {
  const [enviando, setEnviando] = useState(false);
  const [estado, setEstado] = useState<{ tipo: 'ok' | 'encolado' | 'error'; mensaje: string; detalle?: string } | null>(null);
  const [errores, setErrores] = useState<Record<string, string>>({});
  return { enviando, setEnviando, estado, setEstado, errores, setErrores };
}

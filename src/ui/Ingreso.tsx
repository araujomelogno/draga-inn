'use client';

import { useState } from 'react';
import { login, sendMagicLink } from '@/pwa/firebase-client';
import { Marca } from './Marca';

export function Ingreso({ destino }: { destino: string }) {
  const [email, setEmail] = useState('');
  const [clave, setClave] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [enlaceEnviado, setEnlaceEnviado] = useState(false);

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setError(null);
    try {
      await login(email.trim(), clave);
    } catch {
      // No decimos si el email existe o no: no damos pistas sobre las cuentas.
      setError('El correo o la contraseña no coinciden. Revisá los datos e intentá de nuevo.');
    } finally {
      setEnviando(false);
    }
  }

  async function enlace() {
    if (!email.trim()) { setError('Escribí tu correo para enviarte el enlace.'); return; }
    setEnviando(true);
    setError(null);
    try {
      await sendMagicLink(email.trim(), `${window.location.origin}${destino}`);
      setEnlaceEnviado(true);
    } catch {
      setError('No pudimos enviar el enlace. Intentá de nuevo en unos minutos.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <>
      <header className="barra-superior"><Marca /></header>
      <main id="contenido" className="contenedor-angosto">
        <div className="tarjeta" style={{ maxWidth: 420, margin: '2rem auto' }}>
          <h1>Ingresar</h1>
          {enlaceEnviado ? (
            <div className="aviso verde">
              <strong>Te enviamos un enlace a {email}</strong>
              Abrilo desde este mismo dispositivo para entrar.
            </div>
          ) : null}
          {error ? <div className="aviso rojo" role="alert">{error}</div> : null}

          <form onSubmit={entrar} noValidate>
            <div className="campo">
              <label htmlFor="email">Correo electrónico</label>
              <input id="email" type="email" autoComplete="username" inputMode="email"
                value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div className="campo">
              <label htmlFor="clave">Contraseña</label>
              <input id="clave" type="password" autoComplete="current-password"
                value={clave} onChange={(e) => setClave(e.target.value)} />
            </div>
            <button className="boton ancho" type="submit" disabled={enviando}>
              {enviando ? 'Entrando…' : 'Entrar'}
            </button>
          </form>

          <button type="button" className="boton secundario ancho" style={{ marginTop: '.6rem' }} onClick={enlace} disabled={enviando}>
            Enviarme un enlace por correo
          </button>
        </div>
      </main>
    </>
  );
}

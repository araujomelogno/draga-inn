'use client';

import { useState } from 'react';
import { BUILDING_ID, useSesion } from '@/ui/SesionProvider';
import { enviarApi } from '@/ui/datos';
import { Resultado, useEnvio } from '@/ui/formulario';

/** RN-34: se pueden apagar las no críticas. Las de seguridad, no. */
const OPCIONALES = [
  { topic: 'report.owners_digest', label: 'Resumen mensual del edificio' },
  { topic: 'ticket.status_changed', label: 'Cambios de estado de mis reclamos' },
] as const;

export default function Perfil() {
  const { perfil, salir } = useSesion();
  const [silenciados, setSilenciados] = useState<string[]>([]);
  const { enviando, setEnviando, estado, setEstado } = useEnvio();

  async function guardar() {
    setEnviando(true);
    const r = await enviarApi(BUILDING_ID, '/notifications', { mutedTopics: silenciados }, 'PATCH');
    setEnviando(false);
    setEstado(r.ok ? { tipo: 'ok', mensaje: 'Preferencias guardadas.' } : { tipo: 'error', mensaje: r.message });
  }

  return (
    <>
      <h1>Perfil</h1>
      <Resultado estado={estado} />

      <section className="tarjeta">
        <h2>Tus datos</h2>
        <dl style={{ margin: 0 }}>
          <div className="entre" style={{ padding: '.4rem 0', borderBottom: '1px solid var(--borde)' }}>
            <dt style={{ color: 'var(--texto-suave)' }}>Nombre</dt>
            <dd style={{ margin: 0, fontWeight: 650 }}>{perfil?.user.displayName ?? '—'}</dd>
          </div>
          <div className="entre" style={{ padding: '.4rem 0', borderBottom: '1px solid var(--borde)' }}>
            <dt style={{ color: 'var(--texto-suave)' }}>Correo</dt>
            <dd style={{ margin: 0, fontWeight: 650 }}>{perfil?.user.email}</dd>
          </div>
          <div className="entre" style={{ padding: '.4rem 0' }}>
            <dt style={{ color: 'var(--texto-suave)' }}>Rol</dt>
            <dd style={{ margin: 0, fontWeight: 650 }}>{perfil?.roleLabels.join(', ')}</dd>
          </div>
        </dl>
      </section>

      <section className="tarjeta">
        <h2>Avisos por correo</h2>
        {OPCIONALES.map((o) => (
          <label key={o.topic} className="fila" style={{ gap: '.5rem', minHeight: 44 }}>
            <input type="checkbox" checked={!silenciados.includes(o.topic)}
              onChange={(e) => setSilenciados((s) => (e.target.checked ? s.filter((x) => x !== o.topic) : [...s, o.topic]))}
              style={{ width: 22, minHeight: 22 }} />
            {o.label}
          </label>
        ))}
        <p className="ayuda">
          Los avisos de seguridad —incidentes graves y reclamos críticos— no se pueden desactivar.
        </p>
        <button className="boton" type="button" onClick={() => void guardar()} disabled={enviando}>Guardar preferencias</button>
      </section>

      <section className="tarjeta">
        <h2>Tus datos personales</h2>
        <p style={{ color: 'var(--texto-suave)' }}>
          Tratamos tus datos bajo la Ley N.º 18.331 de protección de datos personales (Uruguay).
          Podés pedir acceso, rectificación o supresión escribiendo a la administración del edificio.
        </p>
      </section>

      <button className="boton secundario ancho" type="button" onClick={() => void salir()}>Cerrar sesión</button>
    </>
  );
}

'use client';

import { useState } from 'react';
import { BUILDING_ID } from '@/ui/SesionProvider';
import { Campo, Resultado, useEnvio } from '@/ui/formulario';
import { MutationError, mutate } from '@/pwa/sync';
import { INCIDENT_LABELS } from '@/shared/schemas';

const TIPOS = Object.entries(INCIDENT_LABELS) as [keyof typeof INCIDENT_LABELS, string][];
/** RN-25: estos avisan al administrador de inmediato y no se pueden silenciar. */
const GRAVES: (keyof typeof INCIDENT_LABELS)[] = ['accident', 'fire_start'];

/** ESPEC §4.5 — Incidente (Anexo F). */
export default function Incidente() {
  const [cuando, setCuando] = useState(() => new Date().toISOString().slice(0, 16));
  const [tipo, setTipo] = useState<keyof typeof INCIDENT_LABELS>('other');
  const [descripcion, setDescripcion] = useState('');
  const [accion, setAccion] = useState('');
  const [avisadoA, setAvisadoA] = useState('');
  const { enviando, setEnviando, estado, setEstado, errores, setErrores } = useEnvio();

  const esGrave = GRAVES.includes(tipo);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setErrores({});
    setEstado(null);
    if (descripcion.trim().length < 10) {
      setErrores({ description: 'Describí el incidente con al menos 10 caracteres.' });
      return;
    }

    setEnviando(true);
    try {
      const res = await mutate(
        BUILDING_ID,
        '/incidents',
        {
          occurredAt: new Date(cuando).toISOString(),
          incidentType: tipo,
          description: descripcion.trim(),
          actionTaken: accion || null,
          notifiedTo: avisadoA || null,
          status: 'open',
        },
        { label: `Incidente: ${INCIDENT_LABELS[tipo]}` },
      );

      setEstado(
        res.queued
          ? { tipo: 'encolado', mensaje: esGrave ? 'Es un incidente grave: se avisará al administrador apenas vuelva la señal.' : 'Se enviará al recuperar señal.' }
          : { tipo: 'ok', mensaje: 'Incidente registrado.', detalle: esGrave ? 'Se avisó al administrador de inmediato.' : undefined },
      );
      setDescripcion(''); setAccion(''); setAvisadoA('');
    } catch (err) {
      setEstado({ tipo: 'error', mensaje: err instanceof MutationError ? err.message : 'No pudimos registrar el incidente.' });
    } finally {
      setEnviando(false);
    }
  }

  return (
    <>
      <h1>Incidente</h1>
      <p style={{ color: 'var(--texto-suave)' }}>Anexo F del Manual</p>
      <Resultado estado={estado} />

      {esGrave ? (
        <div className="aviso rojo" role="alert">
          <strong>Este incidente avisa al administrador de inmediato</strong>
          Si hay riesgo para personas, llamá primero al 911 y después registralo acá.
        </div>
      ) : null}

      <form className="tarjeta" onSubmit={enviar} noValidate>
        <Campo label="Fecha y hora" htmlFor="cuando">
          <input id="cuando" type="datetime-local" value={cuando} onChange={(e) => setCuando(e.target.value)} />
        </Campo>

        <Campo label="Tipo" htmlFor="tipo">
          <select id="tipo" value={tipo} onChange={(e) => setTipo(e.target.value as keyof typeof INCIDENT_LABELS)}>
            {TIPOS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </Campo>

        <Campo label="¿Qué pasó? *" htmlFor="descripcion" error={errores.description}>
          <textarea id="descripcion" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
        </Campo>

        <Campo label="¿Qué hiciste?" htmlFor="accion">
          <textarea id="accion" value={accion} onChange={(e) => setAccion(e.target.value)} />
        </Campo>

        <Campo label="¿A quién avisaste?" htmlFor="avisado">
          <input id="avisado" type="text" value={avisadoA} onChange={(e) => setAvisadoA(e.target.value)} />
        </Campo>

        <button className="boton ancho grande" type="submit" disabled={enviando}>
          {enviando ? 'Guardando…' : 'Registrar incidente'}
        </button>
      </form>
    </>
  );
}

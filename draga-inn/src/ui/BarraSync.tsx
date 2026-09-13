'use client';

import { useEffect, useState } from 'react';
import { startSync, subscribeSync, type SyncState } from '@/pwa/sync';
import { COLA_ALERTA } from '@/pwa/queue';
import { pluralize } from '@/shared/format';

/**
 * RN-30 — El estado de sincronización es visible de forma permanente.
 * P2 — Nunca decimos "guardado" si el dato solo está encolado.
 */
export function BarraSync({ buildingId }: { buildingId: string }) {
  const [estado, setEstado] = useState<SyncState>({ online: true, pending: 0, syncing: false, failed: 0 });

  useEffect(() => subscribeSync(setEstado), []);
  useEffect(() => startSync(buildingId), [buildingId]);

  if (!estado.online) {
    return (
      <span className="estado-conexion sin-conexion" role="status">
        <span className="punto-estado" aria-hidden="true" />
        Sin conexión
        {estado.pending > 0 ? ` · ${pluralize(estado.pending, 'registro pendiente', 'registros pendientes')}` : ''}
      </span>
    );
  }

  if (estado.syncing) {
    return (
      <span className="estado-conexion pendientes" role="status">
        <span className="punto-estado" aria-hidden="true" />
        Enviando…
      </span>
    );
  }

  if (estado.pending > 0) {
    return (
      <span className="estado-conexion pendientes" role="status">
        <span className="punto-estado" aria-hidden="true" />
        {pluralize(estado.pending, 'registro pendiente', 'registros pendientes')}
        {estado.pending >= COLA_ALERTA ? ' · cola llena' : ''}
      </span>
    );
  }

  return (
    <span className="estado-conexion" role="status">
      <span className="punto-estado" aria-hidden="true" />
      Al día
    </span>
  );
}

/** Marca de un registro que todavía vive solo en el teléfono. */
export function MarcaPendiente() {
  return <span className="pendiente-envio">Pendiente de enviar</span>;
}

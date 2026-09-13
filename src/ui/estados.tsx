/**
 * Los cuatro estados de toda vista (ESPEC §9): carga, vacío, error, contenido.
 * Ninguna lista los implementa por su cuenta.
 */
import { formatDateTime } from '@/shared/format';

export function Esqueleto({ filas = 4 }: { filas?: number }) {
  return (
    <div aria-busy="true" aria-live="polite">
      <span className="visualmente-oculto">Cargando…</span>
      {Array.from({ length: filas }, (_, i) => (
        <div key={i} className="esqueleto" style={{ width: `${100 - i * 7}%`, height: i === 0 ? '1.4rem' : '1rem' }} />
      ))}
    </div>
  );
}

export function Vacio({ titulo, detalle, accion }: { titulo: string; detalle?: string; accion?: React.ReactNode }) {
  return (
    <div className="estado-vacio">
      <p className="titulo">{titulo}</p>
      {detalle ? <p>{detalle}</p> : null}
      {accion}
    </div>
  );
}

export function SinResultados({ onLimpiar }: { onLimpiar?: () => void }) {
  return (
    <div className="estado-vacio">
      <p className="titulo">No hay resultados con estos filtros.</p>
      {onLimpiar ? (
        <button type="button" className="boton secundario" onClick={onLimpiar}>Limpiar filtros</button>
      ) : null}
    </div>
  );
}

export function ErrorDeRed({ onReintentar, desde }: { onReintentar?: () => void; desde?: number }) {
  if (desde) {
    return (
      <div className="aviso ambar">
        Mostrando información guardada del {formatDateTime(new Date(desde))}.
      </div>
    );
  }
  return (
    <div className="estado-vacio">
      <p className="titulo">No pudimos cargar la información.</p>
      <p>Revisá tu conexión.</p>
      {onReintentar ? <button type="button" className="boton" onClick={onReintentar}>Reintentar</button> : null}
    </div>
  );
}

export function SinPermiso() {
  // No filtramos detalles de lo que existe.
  return <div className="estado-vacio"><p className="titulo">No tenés permiso para ver esta información.</p></div>;
}

export function ErrorServidor({ referencia }: { referencia?: string }) {
  return (
    <div className="aviso rojo">
      <strong>Algo salió mal de nuestro lado. Ya lo registramos.</strong>
      {referencia ? <span>Código de referencia: <code>{referencia}</code></span> : null}
    </div>
  );
}

/** RN-51 — la leyenda va al pie de TODA vista de cumplimiento. */
export function LeyendaCumplimiento({ texto }: { texto: string }) {
  return <p className="leyenda-cumplimiento">{texto}</p>;
}

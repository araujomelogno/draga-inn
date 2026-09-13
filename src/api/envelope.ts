import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { DomainError } from '@/shared/errors';

export type Envelope<T> = { data: T; meta?: Record<string, unknown> };

export function ok<T>(data: T, meta?: Record<string, unknown>, init?: ResponseInit): NextResponse {
  return NextResponse.json({ data, ...(meta ? { meta } : {}) } satisfies Envelope<T>, init);
}

export function created<T>(data: T, meta?: Record<string, unknown>): NextResponse {
  return ok(data, meta, { status: 201 });
}

export function fail(code: string, message: string, status: number, details?: Record<string, unknown>): NextResponse {
  return NextResponse.json({ error: { code, message, ...(details ? { details } : {}) } }, { status });
}

/**
 * Traduce cualquier excepción a la respuesta de ESPEC §9.
 * El error del servidor no filtra el stack: devuelve un código de referencia.
 */
export function toResponse(err: unknown, requestId: string): NextResponse {
  if (err instanceof DomainError) {
    return fail(err.code, err.message, err.status, err.details);
  }
  if (err instanceof ZodError) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of err.issues) {
      const path = issue.path.join('.') || '_';
      fieldErrors[path] ??= issue.message;
    }
    const first = err.issues[0]?.message ?? 'Revisá los datos ingresados.';
    return fail('VALIDATION_FAILED', first, 422, { fields: fieldErrors });
  }

  const pg = err as { code?: string; constraint?: string; message?: string };

  // Idempotencia y duplicados con mensaje útil (ESPEC §4.3, CB-08)
  if (pg.code === '23505') {
    if (pg.constraint === 'pool_logs_slot_uq') {
      return fail('DUPLICATE', 'Ya hay un registro de piscina para esa fecha y hora. Cambiá la hora o editá el registro existente.', 409);
    }
    return fail('DUPLICATE', 'Ese registro ya existe. Revisá si no lo cargaste antes.', 409);
  }
  // Exclusión de solapamiento en unit_occupancies (RN-03)
  if (pg.code === '23P01') {
    return fail('OVERLAP', 'Ya hay un titular vigente para esa unidad en ese período. Cerrá el período anterior antes de abrir uno nuevo.', 409);
  }
  // Triggers de dominio (append-only, RN-04, RN-42)
  if (pg.code === '23001' && pg.message) {
    return fail('RESTRICTED', pg.message.replace(/^ERROR:\s*/, ''), 422);
  }
  if (pg.code === '23503') {
    return fail('REFERENCE', 'No se puede completar: hay información vinculada que quedaría huérfana.', 409);
  }

  console.error(JSON.stringify({ severity: 'ERROR', requestId, message: (err as Error)?.message, stack: (err as Error)?.stack }));
  return fail('INTERNAL', 'Algo salió mal de nuestro lado. Ya lo registramos.', 500, { reference: requestId });
}

import type { Tx } from '@/db/tx';
import { outbox } from '@/db/schema';

/**
 * Encola un hecho para despacho. La transacción de negocio y el envío no
 * comparten destino: si el correo falla, el hecho ya quedó registrado.
 */
export async function enqueue(
  tx: Tx,
  buildingId: string,
  topic: string,
  payload: Record<string, unknown>,
  availableAt?: Date,
): Promise<void> {
  await tx.insert(outbox).values({
    buildingId,
    topic,
    payload,
    ...(availableAt ? { availableAt } : {}),
  });
}

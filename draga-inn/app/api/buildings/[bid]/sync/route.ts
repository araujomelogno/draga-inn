import { route } from '@/api/handler';
import { ok } from '@/api/envelope';
import { withTx } from '@/db/tx';
import { processMutation, prioritize, type MutationResult } from '@/sync/process';
import { syncBatchSchema } from '@/shared/schemas';

export const dynamic = 'force-dynamic';

/**
 * HANDOFF §6.2 — Lote offline.
 *
 * Hasta 50 mutaciones, procesadas EN ORDEN, cada una en su propia transacción:
 * un error en la tercera no revierte las dos primeras. El resultado vuelve por
 * `clientUuid` como `applied` | `duplicate` | `error`.
 */
export const POST = route(async (req, ctx) => {
  const { mutations } = syncBatchSchema.parse(await req.json());
  // CB-03: con la cola acumulada, los críticos salen primero.
  const ordered = prioritize(mutations);

  const results: MutationResult[] = [];
  for (const m of ordered) {
    try {
      results.push(await withTx(ctx, (tx) => processMutation(tx, ctx, m)));
    } catch (err) {
      results.push({
        clientUuid: m.clientUuid, result: 'error', code: 'INTERNAL',
        message: 'No pudimos guardar esta operación. Se reintentará.',
      });
      console.error(JSON.stringify({ severity: 'ERROR', requestId: ctx.requestId, event: 'sync.mutation_failed', clientUuid: m.clientUuid, message: (err as Error).message }));
    }
  }

  return ok(results, {
    applied: results.filter((r) => r.result === 'applied').length,
    duplicate: results.filter((r) => r.result === 'duplicate').length,
    errors: results.filter((r) => r.result === 'error').length,
  });
});

import { describe, expect, it } from 'vitest';
import { prioritize } from '@/sync/process';
import { syncBatchSchema, createTicketSchema, poolLogSchema } from '@/shared/schemas';

describe('CB-03 — con la cola acumulada, lo crítico sale primero', () => {
  it('prioriza incidentes graves, después tickets críticos, después el resto', () => {
    const cola = [
      { clientUuid: 'a', endpoint: '/stock-movements', method: 'POST' as const, body: {} },
      { clientUuid: 'b', endpoint: '/tickets', method: 'POST' as const, body: { priority: 'critical' } },
      { clientUuid: 'c', endpoint: '/incidents', method: 'POST' as const, body: { incidentType: 'fire_start' } },
      { clientUuid: 'd', endpoint: '/tickets', method: 'POST' as const, body: { priority: 'normal' } },
    ];
    expect(prioritize(cola).map((m) => m.clientUuid)).toEqual(['c', 'b', 'd', 'a']);
  });

  it('no pierde ninguna mutación al reordenar', () => {
    const cola = Array.from({ length: 50 }, (_, i) => ({
      clientUuid: `m${i}`, endpoint: '/pool-logs', method: 'POST' as const, body: {},
    }));
    expect(prioritize(cola)).toHaveLength(50);
  });
});

describe('HANDOFF §6.2 — validación del lote', () => {
  it('acepta hasta 50 mutaciones', () => {
    const mutaciones = Array.from({ length: 50 }, (_, i) => ({
      clientUuid: crypto.randomUUID(), endpoint: `/tickets`, method: 'POST' as const, body: { i },
    }));
    expect(() => syncBatchSchema.parse({ mutations: mutaciones })).not.toThrow();
  });

  it('rechaza más de 50, con un mensaje en español', () => {
    const mutaciones = Array.from({ length: 51 }, () => ({
      clientUuid: crypto.randomUUID(), endpoint: '/tickets', method: 'POST' as const, body: {},
    }));
    const r = syncBatchSchema.safeParse({ mutations: mutaciones });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.message).toContain('50 operaciones');
  });

  it('exige que el clientUuid sea un UUID válido: sin él no hay idempotencia', () => {
    const r = syncBatchSchema.safeParse({
      mutations: [{ clientUuid: 'no-es-uuid', endpoint: '/tickets', method: 'POST', body: {} }],
    });
    expect(r.success).toBe(false);
  });
});

describe('ESPEC §4.2 — validación del ticket', () => {
  it('rechaza una descripción de menos de 10 caracteres', () => {
    const r = createTicketSchema.safeParse({ description: 'corto', category: 'plomeria' });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.message).toContain('10 caracteres');
  });

  it('exige categoría', () => {
    expect(createTicketSchema.safeParse({ description: 'Hay una fuga en el subsuelo' }).success).toBe(false);
  });

  it('acepta hasta 5 fotos y rechaza la sexta', () => {
    const base = { description: 'Hay una fuga en el subsuelo', category: 'plomeria' as const };
    const cinco = Array.from({ length: 5 }, () => crypto.randomUUID());
    expect(createTicketSchema.safeParse({ ...base, photoDocumentIds: cinco }).success).toBe(true);
    expect(createTicketSchema.safeParse({ ...base, photoDocumentIds: [...cinco, crypto.randomUUID()] }).success).toBe(false);
  });

  it('la prioridad por defecto es normal', () => {
    const r = createTicketSchema.parse({ description: 'Hay una fuga en el subsuelo', category: 'plomeria' });
    expect(r.priority).toBe('normal');
    expect(r.source).toBe('admin');
  });
});

describe('ESPEC §4.3 — validación de la planilla de piscina', () => {
  it('exige cloro y pH', () => {
    expect(poolLogSchema.safeParse({ loggedOn: '2026-06-15', ph: 7.4 }).success).toBe(false);
    expect(poolLogSchema.safeParse({ loggedOn: '2026-06-15', freeChlorine: 2 }).success).toBe(false);
    expect(poolLogSchema.safeParse({ loggedOn: '2026-06-15', freeChlorine: 2, ph: 7.4 }).success).toBe(true);
  });

  it('rechaza un pH imposible', () => {
    expect(poolLogSchema.safeParse({ loggedOn: '2026-06-15', freeChlorine: 2, ph: 20 }).success).toBe(false);
  });

  it('exige el formato aaaa-mm-dd en la fecha', () => {
    const r = poolLogSchema.safeParse({ loggedOn: '15/06/2026', freeChlorine: 2, ph: 7.4 });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.message).toContain('aaaa-mm-dd');
  });
});

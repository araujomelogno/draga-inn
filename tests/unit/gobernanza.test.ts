import { describe, expect, it } from 'vitest';
import {
  approverFor, assertGovernance, canApproveAmount, checkGovernance,
  invoiceNeedsReapproval, ruleFor, type GovernanceRule,
} from '@/policy/governance';
import { GovernanceError } from '@/shared/errors';
import { ctx } from '../helpers/ctx';

const REGLAS: GovernanceRule[] = [
  { id: 'r1', name: 'Gasto menor', thresholdAmount: '0.00', currency: 'UYU', minQuotes: 1, requiredApproverRole: 'administrador', active: true },
  { id: 'r2', name: 'Gasto medio', thresholdAmount: '30000.00', currency: 'UYU', minQuotes: 2, requiredApproverRole: 'administrador', active: true },
  { id: 'r3', name: 'Gasto mayor', thresholdAmount: '150000.00', currency: 'UYU', minQuotes: 3, requiredApproverRole: 'comision', active: true },
];

const HOY = '2026-06-15';

function quote(id: string, amount = '50000', validUntil: string | null = '2026-12-31', status = 'submitted') {
  return { id, amount, currency: 'UYU', status, validUntil, vendorId: `v-${id}` };
}

function approval(subjectId: string, role: 'administrador' | 'comision' = 'administrador') {
  return { approverRole: role, decision: 'approved', subjectId, approvedAmount: null, isException: false } as const;
}

describe('RN-20 — regla de gobernanza según el monto', () => {
  it('elige la regla activa con el mayor umbral que no supere el monto', () => {
    expect(ruleFor(10_000, REGLAS)?.name).toBe('Gasto menor');
    expect(ruleFor(50_000, REGLAS)?.name).toBe('Gasto medio');
    expect(ruleFor(200_000, REGLAS)?.name).toBe('Gasto mayor');
  });

  it('bloquea la orden de trabajo si faltan presupuestos', () => {
    const r = checkGovernance({
      amount: 50_000, currency: 'UYU', quotes: [quote('q1')], approvals: [approval('q1')],
      rules: REGLAS, quoteId: 'q1', today: HOY,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.missing.quotes).toBe(1);
      // El mensaje dice QUÉ FALTA, no «error de validación» (P6)
      expect(r.message).toContain('Falta 1 presupuesto vigente');
    }
  });

  it('bloquea si falta la aprobación del rol requerido', () => {
    const r = checkGovernance({
      amount: 50_000, currency: 'UYU', quotes: [quote('q1'), quote('q2')], approvals: [],
      rules: REGLAS, quoteId: 'q1', today: HOY,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain('aprobación de Administrador');
  });

  it('deja pasar cuando se cumplen los dos requisitos', () => {
    const r = checkGovernance({
      amount: 50_000, currency: 'UYU', quotes: [quote('q1'), quote('q2')], approvals: [approval('q1')],
      rules: REGLAS, quoteId: 'q1', today: HOY,
    });
    expect(r.ok).toBe(true);
  });

  it('lanza GovernanceError con el detalle de lo que falta', () => {
    expect(() =>
      assertGovernance({
        amount: 200_000, currency: 'UYU', quotes: [quote('q1', '200000')], approvals: [],
        rules: REGLAS, quoteId: 'q1', today: HOY,
      }),
    ).toThrowError(GovernanceError);

    try {
      assertGovernance({
        amount: 200_000, currency: 'UYU', quotes: [quote('q1', '200000')], approvals: [],
        rules: REGLAS, quoteId: 'q1', today: HOY,
      });
    } catch (err) {
      const e = err as GovernanceError;
      expect(e.code).toBe('GOVERNANCE_RULE_UNMET');
      expect(e.details?.requiredQuotes).toBe(3);
      expect(e.details?.providedQuotes).toBe(1);
      expect(e.details?.requiredApproverRole).toBe('comision');
    }
  });

  it('la aprobación de la comisión satisface la exigencia de administrador', () => {
    const r = checkGovernance({
      amount: 50_000, currency: 'UYU', quotes: [quote('q1'), quote('q2')],
      approvals: [approval('q1', 'comision')], rules: REGLAS, quoteId: 'q1', today: HOY,
    });
    expect(r.ok).toBe(true);
  });

  it('la aprobación del administrador NO satisface la exigencia de comisión', () => {
    const r = checkGovernance({
      amount: 200_000, currency: 'UYU',
      quotes: [quote('q1'), quote('q2'), quote('q3')],
      approvals: [approval('q1', 'administrador')], rules: REGLAS, quoteId: 'q1', today: HOY,
    });
    expect(r.ok).toBe(false);
  });
});

describe('CB-07 — un presupuesto vencido no cuenta', () => {
  it('el presupuesto vencido no suma al mínimo requerido', () => {
    const r = checkGovernance({
      amount: 50_000, currency: 'UYU',
      quotes: [quote('q1'), quote('q2', '50000', '2026-01-01')], // q2 venció
      approvals: [approval('q1')], rules: REGLAS, quoteId: 'q1', today: HOY,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.missing.quotes).toBe(1);
  });

  it('un presupuesto sin fecha de validez siempre cuenta', () => {
    const r = checkGovernance({
      amount: 50_000, currency: 'UYU', quotes: [quote('q1', '50000', null), quote('q2', '50000', null)],
      approvals: [approval('q1')], rules: REGLAS, quoteId: 'q1', today: HOY,
    });
    expect(r.ok).toBe(true);
  });
});

describe('§7 — quién puede aprobar qué monto', () => {
  it('bajo umbral aprueba el administrador', () => {
    expect(approverFor(10_000, REGLAS)).toBe('administrador');
    expect(canApproveAmount(ctx(['administrador']), 10_000, REGLAS)).toBe(true);
  });

  it('sobre umbral solo aprueba la comisión', () => {
    expect(approverFor(200_000, REGLAS)).toBe('comision');
    expect(canApproveAmount(ctx(['administrador']), 200_000, REGLAS)).toBe(false);
    expect(canApproveAmount(ctx(['comision']), 200_000, REGLAS)).toBe(true);
  });

  it('el encargado no aprueba ningún monto', () => {
    expect(canApproveAmount(ctx(['encargado']), 1, REGLAS)).toBe(false);
    expect(canApproveAmount(ctx(['encargado']), 999_999, REGLAS)).toBe(false);
  });
});

describe('RN-16 — factura por encima del aprobado más la tolerancia', () => {
  it('dentro de la tolerancia no exige nueva aprobación', () => {
    const r = invoiceNeedsReapproval(105_000, 100_000, 10);
    expect(r.needs).toBe(false);
  });

  it('por encima de la tolerancia exige nueva aprobación', () => {
    const r = invoiceNeedsReapproval(115_000, 100_000, 10);
    expect(r.needs).toBe(true);
    expect(r.ceiling).toBe(110_000);
    expect(r.excess).toBe(5_000);
  });

  it('en el borde exacto de la tolerancia no exige', () => {
    expect(invoiceNeedsReapproval(110_000, 100_000, 10).needs).toBe(false);
  });

  it('el techo se calcula en centavos enteros, sin error de coma flotante', () => {
    // 100000 * (1 + 10/100) en coma flotante da 110000,00000000001
    expect(invoiceNeedsReapproval(115_000, 100_000, 10).ceiling).toBe(110_000);
    expect(invoiceNeedsReapproval(110_000.01, 100_000, 10).needs).toBe(true);
    expect(invoiceNeedsReapproval(110_000.01, 100_000, 10).excess).toBe(0.01);
  });

  it('sin monto aprobado previo no exige', () => {
    expect(invoiceNeedsReapproval(115_000, null, 10).needs).toBe(false);
  });
});

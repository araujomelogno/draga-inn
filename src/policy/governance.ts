import type { AuthContext, AppRole } from '@/auth/context';
import { GovernanceError } from '@/shared/errors';
import { ROLE_LABELS } from '@/auth/context';
import { formatMoney } from '@/shared/format';

export type GovernanceRule = {
  id: string;
  name: string;
  thresholdAmount: string;
  currency: string;
  minQuotes: number;
  requiredApproverRole: AppRole;
  active: boolean;
};

export type QuoteLike = { id: string; amount: string; currency: string; status: string; validUntil: string | null; vendorId: string };
export type ApprovalLike = { approverRole: AppRole; decision: string; subjectId: string; approvedAmount: string | null; isException: boolean };

/**
 * RN-20 — Regla de gobernanza aplicable a un monto.
 * Se elige la regla activa con el mayor `thresholdAmount` que sea ≤ monto.
 * Si ninguna aplica (monto por debajo del primer umbral), no hay exigencia.
 */
export function ruleFor(amount: number, rules: GovernanceRule[]): GovernanceRule | null {
  const applicable = rules
    .filter((r) => r.active && Number(r.thresholdAmount) <= amount)
    .sort((a, b) => Number(b.thresholdAmount) - Number(a.thresholdAmount));
  return applicable[0] ?? null;
}

export type GovernanceCheck =
  | { ok: true; rule: GovernanceRule | null }
  | { ok: false; rule: GovernanceRule; missing: { quotes: number; approval: boolean }; message: string };

export type AssertGovernanceInput = {
  amount: number;
  currency: string;
  quotes: QuoteLike[];
  approvals: ApprovalLike[];
  rules: GovernanceRule[];
  /** El presupuesto que se está por convertir en orden de trabajo. */
  quoteId?: string;
  today: string;
};

/** RN-20 — Chequeo puro, sin efectos. La UI lo usa para mostrar qué falta antes de intentar. */
export function checkGovernance(input: AssertGovernanceInput): GovernanceCheck {
  const rule = ruleFor(input.amount, input.rules);
  if (!rule) return { ok: true, rule: null };

  // CB-07: un presupuesto vencido no cuenta ni para el mínimo ni para aprobar.
  const valid = input.quotes.filter((q) => q.status !== 'rejected' && (!q.validUntil || q.validUntil >= input.today));
  const missingQuotes = Math.max(0, rule.minQuotes - valid.length);

  const hasApproval = input.approvals.some(
    (a) =>
      a.decision === 'approved' &&
      (input.quoteId ? a.subjectId === input.quoteId : true) &&
      roleSatisfies(a.approverRole, rule.requiredApproverRole),
  );

  if (missingQuotes === 0 && hasApproval) return { ok: true, rule };

  const parts: string[] = [];
  if (missingQuotes > 0) {
    parts.push(
      missingQuotes === 1
        ? 'Falta 1 presupuesto vigente'
        : `Faltan ${missingQuotes} presupuestos vigentes`,
    );
  }
  if (!hasApproval) {
    parts.push(`falta la aprobación de ${ROLE_LABELS[rule.requiredApproverRole]}`);
  }

  return {
    ok: false,
    rule,
    missing: { quotes: missingQuotes, approval: !hasApproval },
    message:
      `${parts.join(' y ')} para emitir la orden. ` +
      `Por ${formatMoney(input.amount, input.currency)} rige «${rule.name}»: ` +
      `${rule.minQuotes} ${rule.minQuotes === 1 ? 'presupuesto' : 'presupuestos'} y aprobación de ${ROLE_LABELS[rule.requiredApproverRole]}.`,
  };
}

/**
 * Lanza `GovernanceError` con el requisito faltante si la regla no se cumple.
 * Se puede omitir con `isException` + `exceptionReason`, y solo por administrador
 * o comisión, lo que genera un `case_event` de tipo `governance_exception` (RN-02).
 */
export function assertGovernance(input: AssertGovernanceInput): GovernanceRule | null {
  const result = checkGovernance(input);
  if (result.ok) return result.rule;
  throw new GovernanceError(result.message, {
    ruleId: result.rule.id,
    ruleName: result.rule.name,
    requiredQuotes: result.rule.minQuotes,
    providedQuotes: result.rule.minQuotes - result.missing.quotes,
    requiredApproverRole: result.rule.requiredApproverRole,
    canResolve: [result.rule.requiredApproverRole],
  });
}

/** La comisión satisface cualquier exigencia de aprobación; el administrador solo la propia. */
function roleSatisfies(actual: AppRole, required: AppRole): boolean {
  if (actual === required) return true;
  return actual === 'comision' && required === 'administrador';
}

/** ESPEC §5.7: quién puede aprobar este monto, para mostrarlo cuando el usuario no puede. */
export function approverFor(amount: number, rules: GovernanceRule[]): AppRole {
  return ruleFor(amount, rules)?.requiredApproverRole ?? 'administrador';
}

export function canApproveAmount(ctx: AuthContext, amount: number, rules: GovernanceRule[]): boolean {
  const required = approverFor(amount, rules);
  return ctx.roles.some((r) => roleSatisfies(r, required));
}

/**
 * RN-16 — Una factura que excede el monto aprobado más la tolerancia exige
 * nueva aprobación antes de validarse. La tolerancia es configuración del
 * edificio (`settings.invoiceTolerancePct`), nunca una constante.
 */
export function invoiceNeedsReapproval(
  invoiceAmount: number,
  approvedAmount: number | null,
  tolerancePct: number,
): { needs: boolean; ceiling: number; excess: number } {
  if (approvedAmount === null) return { needs: false, ceiling: Infinity, excess: 0 };
  // El cálculo va en centavos enteros: con coma flotante, 100000 * 1,1 da
  // 110000,00000000001 y el techo dejaría pasar un excedente de un centavo.
  const approvedCents = Math.round(approvedAmount * 100);
  const invoiceCents = Math.round(invoiceAmount * 100);
  const ceilingCents = Math.round((approvedCents * (100 + tolerancePct)) / 100);
  const excessCents = Math.max(0, invoiceCents - ceilingCents);
  return { needs: invoiceCents > ceilingCents, ceiling: ceilingCents / 100, excess: excessCents / 100 };
}

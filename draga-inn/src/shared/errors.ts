/**
 * Errores de dominio como clases tipadas. Nunca strings sueltos.
 * `message` es lo que ve el usuario: dice QUÉ HACER, no qué falló (P6).
 */
export class DomainError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class ValidationError extends DomainError {
  constructor(message: string, details?: Record<string, unknown>) {
    super('VALIDATION_FAILED', message, 422, details);
  }
}

export class ForbiddenError extends DomainError {
  constructor(message = 'No tenés permiso para ver esta información.', details?: Record<string, unknown>) {
    super('FORBIDDEN', message, 403, details);
  }
}

export class UnauthorizedError extends DomainError {
  constructor(message = 'Tenés que iniciar sesión para continuar.') {
    super('UNAUTHORIZED', message, 401);
  }
}

export class NotFoundError extends DomainError {
  constructor(message = 'No encontramos lo que buscabas.') {
    super('NOT_FOUND', message, 404);
  }
}

/** CB-01, CB-08: conflicto de versión / estado cambiado por otro usuario. */
export class ConflictError extends DomainError {
  constructor(message: string, details?: Record<string, unknown>) {
    super('CONFLICT', message, 409, details);
  }
}

/** RN-20: falta un requisito de gobernanza. El mensaje dice qué falta y quién lo resuelve. */
export class GovernanceError extends DomainError {
  constructor(message: string, details?: Record<string, unknown>) {
    super('GOVERNANCE_RULE_UNMET', message, 422, details);
  }
}

/** §3: transición de estado no permitida por la máquina de estados. */
export class TransitionError extends DomainError {
  constructor(message: string, details?: Record<string, unknown>) {
    super('TRANSITION_NOT_ALLOWED', message, 422, details);
  }
}

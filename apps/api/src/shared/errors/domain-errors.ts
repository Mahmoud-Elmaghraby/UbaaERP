/**
 * Shared application-layer error types (Clean Architecture §2.1): every
 * module's application layer throws these instead of a NestJS HTTP
 * exception directly, so the application layer never depends on a
 * presentation-layer concept. domain-exception.filter.ts translates them
 * to the right HTTP response, once, for every module.
 *
 * [مستقر — error i18n foundation, added 2026-09-11] Every instance also
 * carries a stable `code` and, optionally, `params` used to interpolate an
 * Arabic message at error-messages.ar.ts. Before this, `message` was the
 * only thing the client ever saw — raw, English, and impossible to
 * translate or branch on programmatically. `message` itself is kept
 * exactly as before (English, human-readable) and is now log/debug-only
 * *for migrated call sites*; DomainExceptionFilter is what actually
 * renders `code`+`params` into the Arabic text returned to the client.
 * Never reuse or rename a `code` once shipped — treat it as part of the
 * API contract, same discipline as a REST route or a DB column.
 *
 * `init` is deliberately OPTIONAL, defaulting to LEGACY_ERROR_CODE. This
 * migration touches ~300 throw sites across every module (see
 * claude/next-steps-backlog.md) and is being rolled out module by module,
 * not in one giant commit (CLAUDE.md §11: small, reviewable changes). A
 * hard-required `init` would make this file's edit alone a breaking
 * compile error for every not-yet-migrated call site. DomainExceptionFilter
 * checks for LEGACY_ERROR_CODE and falls back to the original English
 * `message` in the client response for those — so an unmigrated module's
 * behavior (and its existing tests, some of which assert on the English
 * message text in the HTTP response body) is completely unchanged until
 * it is actually migrated. Once every module is migrated, remove the
 * default and make `init` required again.
 */
export const LEGACY_ERROR_CODE = 'LEGACY.UNMIGRATED';

export interface DomainErrorInit {
  code: string;
  params?: Record<string, string | number>;
}

const LEGACY_INIT: DomainErrorInit = { code: LEGACY_ERROR_CODE };

export abstract class DomainError extends Error {
  readonly code: string;
  readonly params: Record<string, string | number>;

  protected constructor(message: string, init: DomainErrorInit = LEGACY_INIT) {
    super(message);
    this.code = init.code;
    this.params = init.params ?? {};
  }
}

export class NotFoundError extends DomainError {
  constructor(message: string, init?: DomainErrorInit) {
    super(message, init);
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends DomainError {
  constructor(message: string, init?: DomainErrorInit) {
    super(message, init);
    this.name = 'ConflictError';
  }
}

/**
 * Invalid credentials or an invalid/expired/revoked refresh token
 * (AuthService). Translated to 401 by DomainExceptionFilter — kept
 * separate from generic NestJS UnauthorizedException so the application
 * layer (auth.service.ts) stays free of an HTTP-layer dependency, same
 * reasoning as NotFoundError/ConflictError above.
 */
export class AuthenticationError extends DomainError {
  constructor(message: string, init?: DomainErrorInit) {
    super(message, init);
    this.name = 'AuthenticationError';
  }
}

/**
 * A domain business-rule violation that isn't really "not found" or a
 * uniqueness conflict — e.g. Inventory's "cannot record an outgoing stock
 * movement that would leave quantity_on_hand negative". Translated to 422
 * Unprocessable Entity by DomainExceptionFilter. First real consumer:
 * StockMovementsService.
 */
export class BusinessRuleError extends DomainError {
  constructor(message: string, init?: DomainErrorInit) {
    super(message, init);
    this.name = 'BusinessRuleError';
  }
}

export const POSTGRES_UNIQUE_VIOLATION = '23505';

export function isPostgresUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: string }).code === POSTGRES_UNIQUE_VIOLATION
  );
}

export const POSTGRES_FOREIGN_KEY_VIOLATION = '23503';

export function isPostgresForeignKeyViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: string }).code === POSTGRES_FOREIGN_KEY_VIOLATION
  );
}

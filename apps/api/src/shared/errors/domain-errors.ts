/**
 * Shared application-layer error types (Clean Architecture §2.1): every
 * module's application layer throws these instead of a NestJS HTTP
 * exception directly, so the application layer never depends on a
 * presentation-layer concept. domain-exception.filter.ts translates them
 * to the right HTTP response, once, for every module.
 */
export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConflictError';
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

// Re-exported from the shared location so this module's services can
// `from '../errors'` like Settings/Users & Permissions do — see
// ../../../shared/errors/domain-errors.ts for the reasoning, and that
// file for BusinessRuleError, added specifically for this module's stock
// business rules (e.g. no negative stock), and isPostgresForeignKeyViolation,
// used when a product/variant references a unit_of_measure/warehouse that
// doesn't exist.
export {
  BusinessRuleError,
  ConflictError,
  NotFoundError,
  POSTGRES_UNIQUE_VIOLATION,
  POSTGRES_FOREIGN_KEY_VIOLATION,
  isPostgresUniqueViolation,
  isPostgresForeignKeyViolation,
} from '../../../shared/errors/domain-errors';

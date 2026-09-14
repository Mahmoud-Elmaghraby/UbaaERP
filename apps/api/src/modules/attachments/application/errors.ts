// Re-exported from the shared location so this module's services can
// `from '../errors'` like every other module does — see
// ../../../shared/errors/domain-errors.ts for the reasoning.
export {
  BusinessRuleError,
  ConflictError,
  NotFoundError,
  POSTGRES_UNIQUE_VIOLATION,
  POSTGRES_FOREIGN_KEY_VIOLATION,
  isPostgresUniqueViolation,
  isPostgresForeignKeyViolation,
} from '../../../shared/errors/domain-errors';

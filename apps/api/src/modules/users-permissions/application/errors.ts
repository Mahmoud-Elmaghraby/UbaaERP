// Re-exported from the shared location so this module's services can
// `from '../errors'` like Settings does — see
// ../../../shared/errors/domain-errors.ts for the reasoning, and that
// file for AuthenticationError / isPostgresForeignKeyViolation added
// specifically for this module's auth and FK-reference use cases.
export {
  AuthenticationError,
  ConflictError,
  NotFoundError,
  POSTGRES_FOREIGN_KEY_VIOLATION,
  POSTGRES_UNIQUE_VIOLATION,
  isPostgresForeignKeyViolation,
  isPostgresUniqueViolation,
} from '../../../shared/errors/domain-errors';

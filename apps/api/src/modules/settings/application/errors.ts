// Re-exported from the shared location so every existing import in this
// module (`from '../errors'`) keeps working unchanged, while the actual
// definitions live where the global DomainExceptionFilter expects them —
// see ../../../shared/errors/domain-errors.ts for the reasoning.
export {
  ConflictError,
  NotFoundError,
  POSTGRES_UNIQUE_VIOLATION,
  isPostgresUniqueViolation,
} from '../../../shared/errors/domain-errors';

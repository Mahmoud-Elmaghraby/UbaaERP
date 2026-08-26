import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import type { AuditLog, AuditLogFilters, RecordAuditLogInput } from '../../domain/audit-log.entity';

export interface AuditLogRepository {
  record(db: Kysely<TenantDatabase>, input: RecordAuditLogInput): Promise<void>;
  list(
    db: Kysely<TenantDatabase>,
    filters: AuditLogFilters,
    limit: number,
    offset: number,
  ): Promise<AuditLog[]>;
}

export const AUDIT_LOG_REPOSITORY = Symbol('AUDIT_LOG_REPOSITORY');

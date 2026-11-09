import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import type { AuditLog, AuditLogFilters, RecordAuditLogInput } from '../../domain/audit-log.entity';

export interface AuditLogRepository {
  record(db: Kysely<TenantDatabase>, input: RecordAuditLogInput): Promise<void>;
  /** Whether this event (entity, action, metadata.occurredAt) was already logged — Outbox redelivery. */
  existsForEvent(
    db: Kysely<TenantDatabase>,
    entityType: string,
    entityId: string,
    action: string,
    occurredAt: string,
  ): Promise<boolean>;
  /**
   * Wrong-password sign-ins of a user after `since`, newest first — only those after the user's
   * last successful sign-in, password reset/set or unlock (LoginLockoutService).
   */
  recentLoginFailures(db: Kysely<TenantDatabase>, userId: string, since: Date): Promise<Date[]>;
  list(
    db: Kysely<TenantDatabase>,
    filters: AuditLogFilters,
    limit: number,
    offset: number,
  ): Promise<AuditLog[]>;
}

export const AUDIT_LOG_REPOSITORY = Symbol('AUDIT_LOG_REPOSITORY');

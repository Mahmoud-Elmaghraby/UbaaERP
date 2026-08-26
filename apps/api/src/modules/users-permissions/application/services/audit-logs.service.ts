import { Inject, Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import { AUDIT_LOG_REPOSITORY, type AuditLogRepository } from '../ports/audit-log.repository';
import type { AuditLog, AuditLogFilters } from '../../domain/audit-log.entity';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

@Injectable()
export class AuditLogsService {
  constructor(@Inject(AUDIT_LOG_REPOSITORY) private readonly repository: AuditLogRepository) {}

  list(
    db: Kysely<TenantDatabase>,
    filters: AuditLogFilters,
    limit = DEFAULT_LIMIT,
    offset = 0,
  ): Promise<AuditLog[]> {
    const boundedLimit = Math.min(Math.max(limit, 1), MAX_LIMIT);
    return this.repository.list(db, filters, boundedLimit, Math.max(offset, 0));
  }
}

import { randomUUID } from 'node:crypto';
import type { Kysely, Selectable } from 'kysely';
import type { AuditLogsTable, TenantDatabase } from '../../../../database/tenant/kysely-client';
import type { AuditLogRepository } from '../../application/ports/audit-log.repository';
import type { AuditLog, AuditLogFilters, RecordAuditLogInput } from '../../domain/audit-log.entity';

function toDomain(row: Selectable<AuditLogsTable>): AuditLog {
  return {
    id: row.id,
    userId: row.user_id,
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id,
    metadata: (row.metadata ?? {}) as Record<string, unknown>,
    createdAt: row.created_at,
  };
}

export class KyselyAuditLogRepository implements AuditLogRepository {
  async record(db: Kysely<TenantDatabase>, input: RecordAuditLogInput): Promise<void> {
    await db
      .insertInto('audit_logs')
      .values({
        id: randomUUID(),
        user_id: input.userId,
        action: input.action,
        entity_type: input.entityType,
        entity_id: input.entityId ?? null,
        metadata: JSON.stringify(input.metadata ?? {}),
      })
      .execute();
  }

  async list(
    db: Kysely<TenantDatabase>,
    filters: AuditLogFilters,
    limit: number,
    offset: number,
  ): Promise<AuditLog[]> {
    let query = db.selectFrom('audit_logs').selectAll();

    if (filters.userId) query = query.where('user_id', '=', filters.userId);
    if (filters.entityType) query = query.where('entity_type', '=', filters.entityType);
    if (filters.action) query = query.where('action', '=', filters.action);
    if (filters.from) query = query.where('created_at', '>=', filters.from);
    if (filters.to) query = query.where('created_at', '<=', filters.to);

    const rows = await query.orderBy('created_at', 'desc').limit(limit).offset(offset).execute();
    return rows.map(toDomain);
  }
}

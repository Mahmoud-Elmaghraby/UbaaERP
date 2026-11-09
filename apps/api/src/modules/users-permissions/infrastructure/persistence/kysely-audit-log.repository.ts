import { randomUUID } from 'node:crypto';
import { sql, type Kysely, type Selectable } from 'kysely';
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

  async existsForEvent(
    db: Kysely<TenantDatabase>,
    entityType: string,
    entityId: string,
    action: string,
    occurredAt: string,
  ): Promise<boolean> {
    const row = await db
      .selectFrom('audit_logs')
      .select('id')
      .where('entity_type', '=', entityType)
      .where('entity_id', '=', entityId)
      .where('action', '=', action)
      .where(sql<string>`metadata->>'occurredAt'`, '=', occurredAt)
      .executeTakeFirst();
    return Boolean(row);
  }

  async recentLoginFailures(db: Kysely<TenantDatabase>, userId: string, since: Date): Promise<Date[]> {
    const lastReset = await db
      .selectFrom('audit_logs')
      .select((eb) => eb.fn.max('created_at').as('at'))
      .where('entity_type', '=', 'user')
      .where('entity_id', '=', userId)
      .where('action', 'in', ['auth.login', 'auth.password_reset_completed', 'user.password_set', 'user.unlocked', 'user.invite_accepted'])
      .executeTakeFirst();
    const after = lastReset?.at && new Date(lastReset.at) > since ? new Date(lastReset.at) : since;
    const rows = await db
      .selectFrom('audit_logs')
      .select('created_at')
      .where('entity_type', '=', 'user')
      .where('entity_id', '=', userId)
      .where('action', '=', 'auth.login_failed')
      .where(sql<string>`metadata->>'reason'`, '=', 'wrong_password')
      .where('created_at', '>', after)
      .orderBy('created_at', 'desc')
      .execute();
    return rows.map((r) => new Date(r.created_at));
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
    if (filters.entityTypes?.length) query = query.where('entity_type', 'in', filters.entityTypes);
    if (filters.entityId) query = query.where('entity_id', '=', filters.entityId);
    if (filters.action) query = query.where('action', '=', filters.action);
    if (filters.from) query = query.where('created_at', '>=', filters.from);
    if (filters.to) query = query.where('created_at', '<=', filters.to);

    const rows = await query.orderBy('created_at', 'desc').limit(limit).offset(offset).execute();
    return rows.map(toDomain);
  }
}

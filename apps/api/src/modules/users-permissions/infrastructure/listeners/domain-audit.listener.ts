import { Inject, Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { AUDIT_LOG_REPOSITORY, type AuditLogRepository } from '../../application/ports/audit-log.repository';
import { TenantConnectionManager } from '../../../../shared/tenancy/tenant-connection-manager';
import type { DomainEventPayload } from '../../../../shared/events/domain-event';

const MAX_VALUE_LENGTH = 500;

function isDomainEvent(payload: unknown): payload is DomainEventPayload {
  const p = payload as Partial<DomainEventPayload> | null;
  return Boolean(
    p && typeof p.schema === 'string' && typeof p.entityType === 'string' && typeof p.action === 'string',
  );
}

/**
 * What of an event's metadata is worth keeping in the audit log: numbers, references and money
 * stay; line arrays become a count (the document itself holds the lines); anything big is dropped.
 */
export function auditMetadata(metadata: Record<string, unknown> | undefined): Record<string, unknown> {
  const kept: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata ?? {})) {
    if (value === null || value === undefined) continue;
    if (Array.isArray(value)) {
      kept[`${key}Count`] = value.length;
    } else if (typeof value === 'object') {
      const json = JSON.stringify(value);
      if (json.length <= MAX_VALUE_LENGTH) kept[key] = value;
    } else if (typeof value !== 'string' || value.length <= MAX_VALUE_LENGTH) {
      kept[key] = value;
    }
  }
  return kept;
}

/**
 * The audit trail for the business modules (sales, purchases, inventory, accounting, settings), without
 * Users & Permissions importing their code (CLAUDE.md §2.6: Event Bus only). Every
 * '<module>.<entity>.<action>' event — the plain CRUD ones and the Outbox-dispatched financial
 * ones alike — becomes one audit_logs row: entity_type + entity_id + the plain action ('posted'),
 * which is what each document's history panel reads.
 *
 * Best-effort and never throwing: an Outbox event is dispatched with emitAsync, so an error here
 * would make Accounting's event retry. The Outbox may still deliver an event twice after another
 * listener failed, so a row already written for the same event (same entity, action and
 * occurredAt) is not written again.
 */
@Injectable()
export class DomainAuditListener {
  private readonly logger = new Logger(DomainAuditListener.name);

  constructor(
    @Inject(AUDIT_LOG_REPOSITORY) private readonly auditLogs: AuditLogRepository,
    private readonly connections: TenantConnectionManager,
  ) {}

  @OnEvent('sales.**')
  @OnEvent('purchases.**')
  @OnEvent('inventory.**')
  @OnEvent('accounting.**')
  @OnEvent('settings.**')
  async handle(payload: unknown): Promise<void> {
    if (!isDomainEvent(payload)) return;
    try {
      const db = this.connections.getClient(payload.schema);
      const occurredAt = new Date(payload.occurredAt ?? Date.now()).toISOString();
      if (payload.entityId && (await this.auditLogs.existsForEvent(db, payload.entityType, payload.entityId, payload.action, occurredAt))) {
        return;
      }
      await this.auditLogs.record(db, {
        userId: payload.actorUserId,
        action: payload.action,
        entityType: payload.entityType,
        entityId: payload.entityId,
        metadata: { ...auditMetadata(payload.metadata), occurredAt },
      });
    } catch (err) {
      this.logger.warn(
        `Audit entry for ${payload.entityType}.${payload.action} not written: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}

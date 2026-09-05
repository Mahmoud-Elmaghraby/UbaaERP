import { Inject, Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { AUDIT_LOG_REPOSITORY, type AuditLogRepository } from '../../application/ports/audit-log.repository';
import { TenantConnectionManager } from '../../../../shared/tenancy/tenant-connection-manager';
import type { DomainEventPayload } from '../../../../shared/events/domain-event';

/**
 * Best-effort audit trail for another module's actions, without Users &
 * Permissions importing Inventory's code (CLAUDE.md §2.6: cross-module
 * communication only via the Event Bus). Subscribes to every
 * 'inventory.*' integration event (InventoryEventPublisher) and records
 * one audit_logs row per event — the same table Users & Permissions'
 * own services already write to directly (they're intra-module calls;
 * this is the cross-module equivalent).
 *
 * "Best-effort": unlike the Outbox-pattern-backed financial events §2.7
 * describes, a dropped audit entry here (e.g. this listener throwing) is
 * not a correctness issue for Inventory's own data — it would only be a
 * gap in the audit trail. Revisit if that stops being an acceptable
 * trade-off.
 */
@Injectable()
export class InventoryAuditListener {
  constructor(
    @Inject(AUDIT_LOG_REPOSITORY) private readonly auditLogs: AuditLogRepository,
    private readonly connections: TenantConnectionManager,
  ) {}

  @OnEvent('inventory.**')
  async handle(payload: DomainEventPayload): Promise<void> {
    const db = this.connections.getClient(payload.schema);
    await this.auditLogs.record(db, {
      userId: payload.actorUserId,
      action: `inventory.${payload.entityType}.${payload.action}`,
      entityType: payload.entityType,
      entityId: payload.entityId,
      metadata: payload.metadata ?? {},
    });
  }
}

import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { DomainEventPayload } from '../../../../shared/events/domain-event';

/**
 * Thin wrapper around the Event Bus (EventEmitter2) for Inventory's
 * integration events — event name is always 'inventory.<entityType>.<action>'
 * (e.g. 'inventory.warehouse.created', 'inventory.stock_movement.recorded').
 *
 * Deliberately injected straight into controllers rather than routed
 * through an application-layer port: these are presentation-adjacent
 * concerns (the tenant schema and the acting user both come from the
 * HTTP request, via @CurrentTenantSchema()/@CurrentUser()) and today's
 * only consumer is a best-effort audit-log listener, not a business rule
 * StockMovementsService itself needs to enforce. If a future module needs
 * to react to these events as part of an actual business flow, promote
 * this to an application-layer port at that point.
 */
@Injectable()
export class InventoryEventPublisher {
  constructor(private readonly emitter: EventEmitter2) {}

  publish(
    entityType: string,
    action: string,
    input: { schema: string; entityId: string; actorUserId: string | null; metadata?: Record<string, unknown> },
  ): void {
    const payload: DomainEventPayload = {
      schema: input.schema,
      entityType,
      entityId: input.entityId,
      action,
      actorUserId: input.actorUserId,
      metadata: input.metadata,
      occurredAt: new Date(),
    };
    this.emitter.emit(`inventory.${entityType}.${action}`, payload);
  }
}

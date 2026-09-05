import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { DomainEventPayload } from '../../../../shared/events/domain-event';

/**
 * Thin wrapper around the Event Bus (EventEmitter2) for Purchases'
 * integration events — event name is always 'purchases.<entityType>.<action>'
 * (e.g. 'purchases.supplier.created'). Mirrors InventoryEventPublisher
 * (apps/api/src/modules/inventory/infrastructure/events).
 *
 * Later Purchases stages (goods receipts feeding Inventory, purchase
 * invoices as financial events Accounting will listen for) will need
 * this same channel — goods-receipt stock increases must go through the
 * Event Bus rather than a direct call into Inventory (CLAUDE.md §2.6),
 * and purchase-invoice posting is a financial event that must use the
 * Outbox Pattern (§2.7), not this in-memory-only publisher alone. This
 * publisher covers plain CRUD/audit events (like Inventory's does for
 * units of measure/warehouses); the Outbox-backed path for financial
 * events is a separate mechanism to add when purchase_invoices is built.
 */
@Injectable()
export class PurchasesEventPublisher {
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
    this.emitter.emit(`purchases.${entityType}.${action}`, payload);
  }
}

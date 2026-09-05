import { Inject, Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { Money } from '@erp-platform/shared-kernel';
import { TenantConnectionManager } from '../../../../shared/tenancy/tenant-connection-manager';
import { StockMovementsService } from '../../application/services/stock-movements.service';
import {
  WAREHOUSE_LOCATION_REPOSITORY,
  type WarehouseLocationRepository,
} from '../../application/ports/warehouse-location.repository';
import { DEFAULT_LOCATION_CODE } from '../../domain/warehouse-location.entity';
import type { DomainEventPayload } from '../../../../shared/events/domain-event';

interface GoodsReceiptConfirmedLine {
  productVariantId: string;
  quantity: number;
  unitCost: { amountMinorUnits: string; currency: string };
}

interface GoodsReceiptConfirmedMetadata {
  purchaseOrderId: string;
  warehouseId: string;
  lines: GoodsReceiptConfirmedLine[];
}

/**
 * Increases stock when Purchases confirms a goods receipt — the Event
 * Bus integration point CLAUDE.md §2.6 requires (Inventory must never be
 * called directly by Purchases, nor the reverse). Lives in Inventory,
 * subscribes to Purchases' own integration event, and calls
 * StockMovementsService exactly like any other Inventory-internal caller
 * would; nothing here imports anything from the purchases module — the
 * event payload (schema, entityId, metadata) is the entire contract.
 *
 * Resolves the warehouse's auto-created DEFAULT location and records one
 * 'in' movement per line, with unitCost carried across so
 * StockMovementsService's weighted-average costing picks it up — a
 * goods receipt is a real incoming cost, same as any other 'in' movement.
 *
 * Reliability, a deliberate scope decision (flagged for the user, not
 * silently assumed): this stays on the plain Event Bus (EventEmitter2),
 * the same trade-off already accepted for InventoryAuditListener — see
 * that listener's and domain-event.ts's class comments. CLAUDE.md §2.7's
 * Outbox Pattern requirement is scoped to *financial* events (the
 * examples given are sale/purchase invoice posting, i.e. events
 * Accounting must never miss); a goods receipt's stock effect is an
 * inventory-quantity concern, not a ledger posting, so Outbox is
 * reserved for Stage 7 (Purchase Invoices) as already documented.
 * Unlike the audit listener though, a failure here IS a real correctness
 * gap (physical stock received but stock_levels not updated) — so it's
 * logged loudly (Logger.error) rather than silently swallowed, and each
 * line's movement is independently transactional (StockMovementsService
 * .recordMovement() wraps each call in its own DB transaction), so a
 * failure partway through only leaves the remaining lines un-applied,
 * not a corrupted partial movement. No retry and no reconciliation job
 * exist yet; revisit if this gap proves to matter in practice (a
 * dead-letter/retry mechanism, or promoting this specific event to the
 * Outbox pattern, are both reasonable future options).
 */
@Injectable()
export class GoodsReceiptStockListener {
  private readonly logger = new Logger(GoodsReceiptStockListener.name);

  constructor(
    private readonly stockMovements: StockMovementsService,
    @Inject(WAREHOUSE_LOCATION_REPOSITORY) private readonly locations: WarehouseLocationRepository,
    private readonly connections: TenantConnectionManager,
  ) {}

  @OnEvent('purchases.goods_receipt.confirmed')
  async handle(payload: DomainEventPayload): Promise<void> {
    const metadata = payload.metadata as unknown as GoodsReceiptConfirmedMetadata | undefined;
    if (!metadata || !metadata.lines || metadata.lines.length === 0) {
      this.logger.warn(`Received 'purchases.goods_receipt.confirmed' with no usable line metadata — ignoring.`);
      return;
    }

    const db = this.connections.getClient(payload.schema);

    try {
      const warehouseLocations = await this.locations.listByWarehouseId(db, metadata.warehouseId);
      const defaultLocation = warehouseLocations.find((location) => location.code === DEFAULT_LOCATION_CODE);
      if (!defaultLocation) {
        throw new Error(`Warehouse "${metadata.warehouseId}" has no default location — cannot receive stock.`);
      }

      for (const line of metadata.lines) {
        await this.stockMovements.recordMovement(db, {
          productVariantId: line.productVariantId,
          locationId: defaultLocation.id,
          movementType: 'in',
          quantity: line.quantity,
          unitCost: Money.fromMinorUnits(BigInt(line.unitCost.amountMinorUnits), line.unitCost.currency),
          referenceType: 'goods_receipt',
          referenceId: payload.entityId,
        });
      }
    } catch (err) {
      this.logger.error(
        `Failed to apply stock movement(s) for goods receipt "${payload.entityId}" ` +
          `(tenant schema "${payload.schema}"): ${err instanceof Error ? err.message : String(err)}. ` +
          'Stock levels may now be out of sync with what was physically received — needs manual reconciliation.',
      );
    }
  }
}

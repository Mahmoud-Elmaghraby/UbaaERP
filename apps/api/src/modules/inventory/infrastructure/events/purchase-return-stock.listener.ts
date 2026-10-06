import { Inject, Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { TenantConnectionManager } from '../../../../shared/tenancy/tenant-connection-manager';
import { StockMovementsService } from '../../application/services/stock-movements.service';
import {
  WAREHOUSE_LOCATION_REPOSITORY,
  type WarehouseLocationRepository,
} from '../../application/ports/warehouse-location.repository';
import { DEFAULT_LOCATION_CODE } from '../../domain/warehouse-location.entity';
import type { DomainEventPayload } from '../../../../shared/events/domain-event';
import { withTransaction } from '../../../../database/tenant/transaction.util';

interface PurchaseReturnConfirmedLine {
  productVariantId: string;
  quantity: number;
}

interface PurchaseReturnConfirmedMetadata {
  goodsReceiptId: string;
  warehouseId: string;
  lines: PurchaseReturnConfirmedLine[];
}

/**
 * Decreases stock when Purchases confirms a purchase return — the Event
 * Bus integration point CLAUDE.md §2.6 requires, the mirror image of
 * GoodsReceiptStockListener (goods-receipt-stock.listener.ts, same
 * directory). Kept as a separate file/class rather than folded into that
 * listener: the two share the "resolve the warehouse's default location"
 * step, but this session's device-bridge tooling can't delete/rename
 * files without an explicit user permission step, so touching Stage 5's
 * already-shipped listener file for a same-shape-but-separate concern
 * wasn't worth that friction. A future cleanup pass could merge them.
 *
 * Records one 'out' movement per line via the same StockMovementsService
 * every other Inventory-internal caller uses — no import of anything
 * from the purchases module, same as its sibling listener. No unitCost
 * is passed: 'out' movements always use the location's current average
 * cost and ignore any caller-supplied cost (see
 * StockMovementsService.OutgoingParams), so there is nothing to carry
 * across from the original receipt.
 *
 * Known limitation, explicitly not solved here: for a lot/serial-tracked
 * product, this uses the default FIFO-by-expiry lot selection (no lotId
 * given), not necessarily the exact lot the goods were originally
 * received into — purchase_return_lines doesn't capture which
 * stock_lot the original 'in' movement used. Precise lot-return tracking
 * is a reasonable future enhancement, not required for this stage's
 * scope (see claude/purchases-module-status.md's Stage 6 write-up).
 *
 * Reliability (inventory audit 2026-10, C3/H1): the event now arrives
 * via the Outbox (PurchaseReturnsService.confirm() writes it in the same
 * transaction as the status flip), and this handler applies all lines
 * in one transaction, skips an already-applied return, and rethrows so
 * the dispatcher retries. A "no negative stock" rejection (the goods were
 * already sold or moved) therefore ends as a failed outbox row after
 * MAX_ATTEMPTS — visible, all-or-nothing — instead of a half-applied,
 * log-only return.
 */
@Injectable()
export class PurchaseReturnStockListener {
  private readonly logger = new Logger(PurchaseReturnStockListener.name);

  constructor(
    private readonly stockMovements: StockMovementsService,
    @Inject(WAREHOUSE_LOCATION_REPOSITORY) private readonly locations: WarehouseLocationRepository,
    private readonly connections: TenantConnectionManager,
  ) {}

  @OnEvent('purchases.purchase_return.confirmed')
  async handle(payload: DomainEventPayload): Promise<void> {
    const metadata = payload.metadata as unknown as PurchaseReturnConfirmedMetadata | undefined;
    if (!metadata || !metadata.lines || metadata.lines.length === 0) {
      this.logger.warn(`Received 'purchases.purchase_return.confirmed' with no usable line metadata — ignoring.`);
      return;
    }

    const db = this.connections.getClient(payload.schema);

    try {
      const warehouseLocations = await this.locations.listByWarehouseId(db, metadata.warehouseId);
      const defaultLocation = warehouseLocations.find((location) => location.code === DEFAULT_LOCATION_CODE);
      if (!defaultLocation) {
        throw new Error(`Warehouse "${metadata.warehouseId}" has no default location — cannot return stock.`);
      }

      await withTransaction(db, async (trx) => {
        await this.stockMovements.lockVariants(
          trx,
          metadata.lines.map((line) => line.productVariantId),
        );
        if (await this.stockMovements.hasMovementsForReference(trx, 'purchase_return', payload.entityId)) {
          this.logger.warn(`Purchase return "${payload.entityId}" was already applied to stock — skipping redelivery.`);
          return;
        }

        for (const line of metadata.lines) {
          await this.stockMovements.recordMovement(trx, {
            productVariantId: line.productVariantId,
            locationId: defaultLocation.id,
            movementType: 'out',
            quantity: line.quantity,
            referenceType: 'purchase_return',
            referenceId: payload.entityId,
          });
        }
      });
    } catch (err) {
      this.logger.error(
        `Failed to apply stock movement(s) for purchase return "${payload.entityId}" ` +
          `(tenant schema "${payload.schema}"): ${err instanceof Error ? err.message : String(err)}. ` +
          'Nothing was applied; the outbox will retry.',
      );
      throw err;
    }
  }
}

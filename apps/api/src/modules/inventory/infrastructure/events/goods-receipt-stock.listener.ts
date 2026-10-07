import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
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
import { withTransaction } from '../../../../database/tenant/transaction.util';
import { InventoryValuationEventsService } from '../../application/services/inventory-valuation-events.service';

interface GoodsReceiptConfirmedLine {
  productVariantId: string;
  quantity: number;
  unitCost: { amountMinorUnits: string; currency: string };
  /** Exact line value in the tenant's currency (migration 0081); absent on older events. */
  totalCost?: { amountMinorUnits: string; currency: string };
  /** Lot/serial split (migration 0077) — non-empty for tracked items; absent on events written before it. */
  lots?: { lotNumber: string; expiryDate: string | null; quantity: number }[];
}

interface GoodsReceiptConfirmedMetadata {
  purchaseOrderId: string;
  warehouseId: string;
  receiptNumber?: string;
  receivedDate?: string | null;
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
 * Reliability (inventory audit 2026-10, C3/H1): the event arrives via the
 * Outbox (GoodsReceiptsService.confirm() writes it in the same
 * transaction as the status flip), and OutboxDispatcherService retries
 * whenever a listener throws. So this handler:
 *  - applies every line in ONE transaction (all or nothing — never a
 *    half-received document),
 *  - pre-locks the document's variants in a stable order (no deadlock
 *    against another document sharing products),
 *  - skips a receipt whose movements already exist (a redelivery after
 *    another listener on the same event failed must not double the stock),
 *  - rethrows after logging, so a failure is retried and, after
 *    MAX_ATTEMPTS, left visible as a failed outbox row — never silently
 *    swallowed.
 */
@Injectable()
export class GoodsReceiptStockListener {
  private readonly logger = new Logger(GoodsReceiptStockListener.name);

  constructor(
    private readonly stockMovements: StockMovementsService,
    @Inject(WAREHOUSE_LOCATION_REPOSITORY) private readonly locations: WarehouseLocationRepository,
    private readonly connections: TenantConnectionManager,
    @Optional() private readonly valuationEvents?: InventoryValuationEventsService,
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

      await withTransaction(db, async (trx) => {
        await this.stockMovements.lockVariants(
          trx,
          metadata.lines.map((line) => line.productVariantId),
        );
        if (await this.stockMovements.hasMovementsForReference(trx, 'goods_receipt', payload.entityId)) {
          this.logger.warn(`Goods receipt "${payload.entityId}" was already applied to stock — skipping redelivery.`);
          return;
        }

        // Service items appear on documents but never move stock.
        const stockItems = await this.stockMovements.stockItemVariantIds(
          trx,
          metadata.lines.map((line) => line.productVariantId),
        );
        const stockLines = metadata.lines.filter((line) => stockItems.has(line.productVariantId));
        let receivedValue: Money | null = null;

        for (const line of stockLines) {
          const unitCost = Money.fromMinorUnits(BigInt(line.unitCost.amountMinorUnits), line.unitCost.currency);
          const tracked = (await this.stockMovements.trackingTypeOf(trx, line.productVariantId)) !== 'none';
          // A tracked line is received lot by lot (one movement each, so
          // every lot gets its number, expiry and cost); Purchases already
          // checked the lots add up to the line quantity.
          const pieces =
            tracked && line.lots?.length
              ? line.lots.map((lot) => ({
                  quantity: lot.quantity,
                  lotNumber: lot.lotNumber,
                  expiryDate: lot.expiryDate ? new Date(`${lot.expiryDate}T00:00:00`) : null,
                }))
              : [{ quantity: line.quantity, lotNumber: undefined, expiryDate: undefined }];
          const pieceCosts = line.totalCost
            ? splitByQuantity(
                Money.fromMinorUnits(BigInt(line.totalCost.amountMinorUnits), line.totalCost.currency),
                pieces.map((piece) => piece.quantity),
              )
            : pieces.map(() => undefined);
          for (const [index, piece] of pieces.entries()) {
            const movement = await this.stockMovements.recordMovement(trx, {
              productVariantId: line.productVariantId,
              locationId: defaultLocation.id,
              movementType: 'in',
              quantity: piece.quantity,
              unitCost,
              totalCost: pieceCosts[index],
              lotNumber: piece.lotNumber,
              expiryDate: piece.expiryDate,
              referenceType: 'goods_receipt',
              referenceId: payload.entityId,
            });
            if (movement.totalCost) {
              receivedValue = receivedValue ? receivedValue.add(movement.totalCost) : movement.totalCost;
            }
          }
        }

        // Dr Inventory / Cr Goods received not invoiced — the purchase invoice clears it.
        if (receivedValue) {
          await this.valuationEvents?.write(trx, {
            schema: payload.schema,
            actorUserId: payload.actorUserId ?? null,
            sourceType: 'goods_receipt',
            sourceId: payload.entityId,
            documentNumber: metadata.receiptNumber ?? null,
            entryDate: metadata.receivedDate ?? null,
            description: `استلام بضاعة ${metadata.receiptNumber ?? ''}`.trim(),
            entries: [{ kind: 'receipt', amount: receivedValue }],
          });
        }
      });
    } catch (err) {
      this.logger.error(
        `Failed to apply stock movement(s) for goods receipt "${payload.entityId}" ` +
          `(tenant schema "${payload.schema}"): ${err instanceof Error ? err.message : String(err)}. ` +
          'Nothing was applied; the outbox will retry.',
      );
      throw err;
    }
  }
}

/** Splits a line value across its lots by quantity; the last lot takes the rounding remainder. */
function splitByQuantity(total: Money, quantities: number[]): Money[] {
  const sum = quantities.reduce((acc, quantity) => acc + quantity, 0);
  let left = total.toMinorUnits();
  return quantities.map((quantity, index) => {
    if (index === quantities.length - 1 || sum <= 0) return Money.fromMinorUnits(left, total.currency);
    const share = BigInt(Math.round((Number(total.toMinorUnits()) * quantity) / sum));
    left -= share;
    return Money.fromMinorUnits(share, total.currency);
  });
}

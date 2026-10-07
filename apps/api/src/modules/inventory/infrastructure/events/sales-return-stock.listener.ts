import { Inject, Injectable, Logger } from '@nestjs/common';
import { OnOutboxEvent } from '../../../../shared/events/on-outbox-event.decorator';
import { Money } from '@erp-platform/shared-kernel';
import { TenantConnectionManager } from '../../../../shared/tenancy/tenant-connection-manager';
import { StockMovementsService } from '../../application/services/stock-movements.service';
import { STOCK_LEVEL_REPOSITORY, type StockLevelRepository } from '../../application/ports/stock-level.repository';
import {
  WAREHOUSE_LOCATION_REPOSITORY,
  type WarehouseLocationRepository,
} from '../../application/ports/warehouse-location.repository';
import { DEFAULT_LOCATION_CODE } from '../../domain/warehouse-location.entity';
import type { DomainEventPayload } from '../../../../shared/events/domain-event';
import { withTransaction } from '../../../../database/tenant/transaction.util';
import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import { OutboxWriterService } from '../../../../shared/outbox/application/services/outbox-writer.service';
import { moneyToDto } from '../../presentation/money.mapper';

interface SalesReturnConfirmedLine {
  productVariantId: string;
  quantity: number;
}

interface SalesReturnConfirmedMetadata {
  deliveryId: string;
  warehouseId: string;
  lines: SalesReturnConfirmedLine[];
}

/**
 * Increases stock when Sales confirms a sales return — the Event Bus
 * integration point CLAUDE.md §2.6 requires, the mirror image of
 * PurchaseReturnStockListener (same directory) with the direction
 * flipped: a purchase return sends stock OUT, a sales return brings
 * stock back IN.
 *
 * The one real difference from every other stock listener in this
 * codebase: an 'in' movement REQUIRES a unit cost
 * (StockMovementsService.recordMovement() throws otherwise), unlike
 * 'out', which always uses the location's current average cost
 * automatically. sales_return_lines carries no cost of its own (see
 * migration 0047's comment — delivery_lines never captured one to
 * carry forward), so this listener looks up the (variant, location)'s
 * CURRENT average cost via StockLevelRepository.findByVariantAndLocation()
 * immediately before recording the movement, and uses that as the
 * incoming unit cost. This keeps the return valuation-neutral — the
 * returned stock re-enters at the same average cost it would have left
 * at — rather than inventing a distinct "return cost" concept.
 *
 * If no stock_levels row exists yet for that (variant, location), the
 * return is rejected with a clear error rather than guessing a cost:
 * in practice this should never happen, since a sales return can only
 * reference a delivery that already shipped stock OUT of that exact
 * (variant, location), which always creates the row.
 *
 * Records one 'in' movement per line via the same StockMovementsService
 * every other Inventory-internal caller uses — no import of anything
 * from the sales module, only the event payload shape is the contract.
 *
 * Reliability (inventory audit 2026-10, C3/H1): delivered via the Outbox
 * (SalesReturnsService.confirm()); same all-or-nothing, idempotent,
 * rethrow-to-retry handling as DeliveryStockListener — see that class's
 * comment, including the nested-transaction bug this fixed.
 */
@Injectable()
export class SalesReturnStockListener {
  private readonly logger = new Logger(SalesReturnStockListener.name);

  constructor(
    private readonly stockMovements: StockMovementsService,
    @Inject(STOCK_LEVEL_REPOSITORY) private readonly stockLevels: StockLevelRepository,
    @Inject(WAREHOUSE_LOCATION_REPOSITORY) private readonly locations: WarehouseLocationRepository,
    private readonly connections: TenantConnectionManager,
    private readonly outboxWriter: OutboxWriterService,
  ) {}

  /**
   * Mirror image of DeliveryStockListener's own new behavior (see that
   * class's comment): records the stock increase AND, in the SAME
   * (nested, savepoint) transaction, writes a new Outbox-backed
   * 'inventory.stock_restoration.recorded' event carrying the cost of
   * the goods restored — Accounting's Stage 6 COGS-reversal listener
   * (debit Inventory, credit COGS — the exact reverse of a delivery's
   * COGS entry) is the consumer.
   */
  @OnOutboxEvent('sales.sales_return.confirmed')
  async handle(payload: DomainEventPayload): Promise<void> {
    const metadata = payload.metadata as unknown as SalesReturnConfirmedMetadata | undefined;
    if (!metadata || !metadata.lines || metadata.lines.length === 0) {
      this.logger.warn(`Received 'sales.sales_return.confirmed' with no usable line metadata — ignoring.`);
      return;
    }

    const db = this.connections.getClient(payload.schema);

    try {
      const warehouseLocations = await this.locations.listByWarehouseId(db, metadata.warehouseId);
      const defaultLocation = warehouseLocations.find((location) => location.code === DEFAULT_LOCATION_CODE);
      if (!defaultLocation) {
        throw new Error(`Warehouse "${metadata.warehouseId}" has no default location — cannot return stock.`);
      }

      // withTransaction, not db.transaction(): recordMovement() joins this
      // same transaction, so all lines AND the cost event commit together.
      await withTransaction(db, async (trx) => {
        await this.stockMovements.lockVariants(
          trx,
          metadata.lines.map((line) => line.productVariantId),
        );
        if (await this.stockMovements.hasMovementsForReference(trx, 'sales_return', payload.entityId)) {
          this.logger.warn(`Sales return "${payload.entityId}" was already applied to stock — skipping redelivery.`);
          return;
        }

        const movements = [];
        // Service items appear on documents but never move stock.
        const stockItems = await this.stockMovements.stockItemVariantIds(
          trx,
          metadata.lines.map((line) => line.productVariantId),
        );
        const stockLines = metadata.lines.filter((line) => stockItems.has(line.productVariantId));
        for (const line of stockLines) {
          const stockLevel = await this.stockLevels.findByVariantAndLocation(
            trx,
            line.productVariantId,
            defaultLocation.id,
          );
          // Goods come back at the cost they left at (the delivery's own COGS),
          // so a return exactly reverses the sale's cost even if the average
          // moved since. Falls back to today's average for old deliveries.
          const originalCost = metadata.deliveryId
            ? await this.stockMovements.unitCostOfReference(trx, 'delivery', metadata.deliveryId, line.productVariantId)
            : null;
          const returnCost = originalCost ?? stockLevel?.averageCost;
          if (!returnCost) {
            throw new Error(
              `No stock level found for product variant "${line.productVariantId}" at location ` +
                `"${defaultLocation.id}" — cannot determine a valuation for the returned stock.`,
            );
          }

          for (const piece of await this.returnPieces(trx, metadata.deliveryId, line)) {
            movements.push(
              await this.stockMovements.recordMovement(trx, {
                productVariantId: line.productVariantId,
                locationId: defaultLocation.id,
                movementType: 'in',
                quantity: piece.quantity,
                unitCost: returnCost,
                lotNumber: piece.lotNumber,
                referenceType: 'sales_return',
                referenceId: payload.entityId,
              }),
            );
          }
        }

        const currency = movements.find((m) => m.unitCost)?.unitCost?.currency;
        if (!currency) {
          this.logger.warn(
            `Sales return "${payload.entityId}" recorded stock movement(s) with no unit cost on any line — ` +
              'skipping the COGS-reversal event (no valuation to post).',
          );
          return;
        }

        let totalCost = Money.zero(currency);
        const costLines = movements.map((movement) => {
          const unitCost = movement.unitCost ?? Money.zero(currency);
          // The movement's exact value (no unit-cost rounding) — matches what left/entered the stock value.
          const lineCost = movement.totalCost ?? unitCost.multiplyByQuantity(movement.quantity);
          totalCost = totalCost.add(lineCost);
          return {
            productVariantId: movement.productVariantId,
            quantity: movement.quantity,
            unitCost: moneyToDto(unitCost),
            totalCost: moneyToDto(lineCost),
          };
        });

        await this.outboxWriter.write(trx, 'inventory.stock_restoration.recorded', {
          schema: payload.schema,
          entityType: 'stock_restoration',
          entityId: payload.entityId,
          action: 'recorded',
          actorUserId: payload.actorUserId,
          metadata: {
            referenceType: 'sales_return',
            referenceId: payload.entityId,
            warehouseId: metadata.warehouseId,
            currency,
            totalCost: moneyToDto(totalCost),
            lines: costLines,
          },
          occurredAt: new Date(),
        });
      });
    } catch (err) {
      this.logger.error(
        `Failed to apply stock movement(s) for sales return "${payload.entityId}" ` +
          `(tenant schema "${payload.schema}"): ${err instanceof Error ? err.message : String(err)}. ` +
          'Nothing was applied; the outbox will retry.',
      );
      throw err;
    }
  }

  /**
   * A tracked item comes back into the lots the original delivery took it
   * from (keeps expiry and recall traceability right); untracked items are
   * one plain movement.
   */
  private async returnPieces(
    trx: Kysely<TenantDatabase>,
    deliveryId: string | undefined,
    line: SalesReturnConfirmedLine,
  ): Promise<{ quantity: number; lotNumber?: string }[]> {
    if ((await this.stockMovements.trackingTypeOf(trx, line.productVariantId)) === 'none') {
      return [{ quantity: line.quantity }];
    }
    const delivered = deliveryId
      ? await this.stockMovements.lotsMovedByReference(trx, 'delivery', deliveryId, line.productVariantId)
      : [];
    const pieces: { quantity: number; lotNumber: string }[] = [];
    let remaining = line.quantity;
    for (const lot of delivered) {
      if (remaining <= 1e-9) break;
      const take = Math.min(lot.quantity, remaining);
      pieces.push({ quantity: take, lotNumber: lot.lotNumber });
      remaining -= take;
    }
    if (remaining > 1e-9) {
      throw new Error(
        `Cannot tell which lot(s) ${remaining} unit(s) of product variant "${line.productVariantId}" returned ` +
          `against delivery "${deliveryId ?? '?'}" belong to — the delivery has no lot record for them.`,
      );
    }
    return pieces;
  }
}

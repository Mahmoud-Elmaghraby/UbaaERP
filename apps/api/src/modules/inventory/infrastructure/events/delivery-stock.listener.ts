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
import { withTransaction } from '../../../../database/tenant/transaction.util';
import { OutboxWriterService } from '../../../../shared/outbox/application/services/outbox-writer.service';
import { moneyToDto } from '../../presentation/money.mapper';

interface DeliveryConfirmedLine {
  productVariantId: string;
  quantity: number;
  /** Lots picked on the delivery line (migration 0077); empty/absent = automatic FEFO. */
  lots?: { lotNumber: string; quantity: number }[];
}

interface DeliveryConfirmedMetadata {
  salesOrderId: string;
  warehouseId: string;
  lines: DeliveryConfirmedLine[];
}

/**
 * Decreases stock when Sales confirms a delivery — the Event Bus
 * integration point CLAUDE.md §2.6 requires, Sales' first cross-module
 * side effect (sales-module-status.md, Stage 4). Structurally identical
 * to PurchaseReturnStockListener (same directory): resolve the
 * warehouse's default location, record one cost-free 'out' movement per
 * line via StockMovementsService — no import of anything from the sales
 * module, only the event payload shape (DeliveryConfirmedMetadata) is
 * the contract, matching every other cross-module listener in this
 * codebase.
 *
 * No unitCost is passed: 'out' movements always use the location's
 * current weighted-average cost (StockMovementsService.OutgoingParams),
 * which is also why delivery_lines (migration 0044) carries no
 * unit_cost column in the first place — there is nothing to carry
 * across from the sales order.
 *
 * Known limitation, explicitly not solved here: for a lot/serial-tracked
 * product, this uses the default FIFO-by-expiry lot selection (no lotId
 * given) rather than a caller-chosen lot — same accepted scope
 * boundary as GoodsReceiptStockListener/PurchaseReturnStockListener.
 *
 * Reliability (inventory audit 2026-10, C3/H1): delivered via the Outbox
 * (DeliveriesService.confirm()); all lines plus the COGS event commit in
 * one transaction, an already-applied delivery is skipped, and failures
 * are rethrown so the dispatcher retries (then leaves a failed outbox row
 * after MAX_ATTEMPTS) instead of being logged and forgotten.
 */
@Injectable()
export class DeliveryStockListener {
  private readonly logger = new Logger(DeliveryStockListener.name);

  constructor(
    private readonly stockMovements: StockMovementsService,
    @Inject(WAREHOUSE_LOCATION_REPOSITORY) private readonly locations: WarehouseLocationRepository,
    private readonly connections: TenantConnectionManager,
    private readonly outboxWriter: OutboxWriterService,
  ) {}

  /**
   * Records the stock decrease AND, in the SAME (nested, savepoint)
   * transaction, writes a new Outbox-backed 'inventory.stock_consumption.
   * recorded' event carrying the actual cost consumed — Accounting's
   * Stage 6 COGS auto-posting listener is the consumer (CLAUDE.md §10 —
   * step 5). This is genuinely financial data (it becomes a COGS journal
   * entry), so unlike the plain stock movements themselves it needs
   * Outbox's atomicity: either the movement AND its cost fact both
   * commit, or neither does — see OutboxWriterService's own comment for
   * why passing the SAME trx is the entire mechanism.
   *
   * Each 'out' StockMovementsService.recordMovement() call returns its
   * own unitCost — always the location's current weighted-average cost
   * for an outgoing movement (StockMovementsService.applyOutgoing) — so
   * no separate valuation lookup is needed here; the cost is simply read
   * back off the movements this same handler already has to create.
   *
   * Until 2026-10 this handler opened db.transaction() and then called
   * recordMovement(trx), which itself called trx.transaction() — Kysely
   * rejects that outright, and the outer try/catch swallowed the error,
   * so confirmed deliveries never decreased stock nor posted COGS.
   * recordMovement() now joins the caller's transaction (withTransaction)
   * and this handler rethrows, so a failure is retried by the outbox.
   */
  @OnEvent('sales.delivery.confirmed')
  async handle(payload: DomainEventPayload): Promise<void> {
    const metadata = payload.metadata as unknown as DeliveryConfirmedMetadata | undefined;
    if (!metadata || !metadata.lines || metadata.lines.length === 0) {
      this.logger.warn(`Received 'sales.delivery.confirmed' with no usable line metadata — ignoring.`);
      return;
    }

    const db = this.connections.getClient(payload.schema);

    try {
      const warehouseLocations = await this.locations.listByWarehouseId(db, metadata.warehouseId);
      const defaultLocation = warehouseLocations.find((location) => location.code === DEFAULT_LOCATION_CODE);
      if (!defaultLocation) {
        throw new Error(`Warehouse "${metadata.warehouseId}" has no default location — cannot ship stock.`);
      }

      // withTransaction, not db.transaction(): recordMovement() joins this
      // same transaction, so all lines AND the cost event commit together.
      await withTransaction(db, async (trx) => {
        await this.stockMovements.lockVariants(
          trx,
          metadata.lines.map((line) => line.productVariantId),
        );
        if (await this.stockMovements.hasMovementsForReference(trx, 'delivery', payload.entityId)) {
          this.logger.warn(`Delivery "${payload.entityId}" was already applied to stock — skipping redelivery.`);
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
          // Tracked items leave lot by lot: the lots picked on the line, or
          // FEFO — never an expired lot (selling expired medicine/feed is
          // what lot tracking exists to prevent).
          const pieces = await this.stockMovements.planOutgoingLots(trx, {
            productVariantId: line.productVariantId,
            locationId: defaultLocation.id,
            quantity: line.quantity,
            requested: line.lots,
            blockExpired: true,
          });
          for (const piece of pieces ?? [{ lotId: undefined, quantity: line.quantity }]) {
            movements.push(
              await this.stockMovements.recordMovement(trx, {
                productVariantId: line.productVariantId,
                locationId: defaultLocation.id,
                movementType: 'out',
                quantity: piece.quantity,
                lotId: piece.lotId,
                referenceType: 'delivery',
                referenceId: payload.entityId,
              }),
            );
          }
        }

        const currency = movements.find((m) => m.unitCost)?.unitCost?.currency;
        if (!currency) {
          this.logger.warn(
            `Delivery "${payload.entityId}" recorded stock movement(s) with no unit cost on any line — ` +
              'skipping the COGS event (no valuation to post).',
          );
          return;
        }

        let totalCost = Money.zero(currency);
        const costLines = movements.map((movement) => {
          const unitCost = movement.unitCost ?? Money.zero(currency);
          const lineCost = unitCost.multiplyByQuantity(movement.quantity);
          totalCost = totalCost.add(lineCost);
          return {
            productVariantId: movement.productVariantId,
            quantity: movement.quantity,
            unitCost: moneyToDto(unitCost),
            totalCost: moneyToDto(lineCost),
          };
        });

        await this.outboxWriter.write(trx, 'inventory.stock_consumption.recorded', {
          schema: payload.schema,
          entityType: 'stock_consumption',
          entityId: payload.entityId,
          action: 'recorded',
          actorUserId: payload.actorUserId,
          metadata: {
            referenceType: 'delivery',
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
        `Failed to apply stock movement(s) for delivery "${payload.entityId}" ` +
          `(tenant schema "${payload.schema}"): ${err instanceof Error ? err.message : String(err)}. ` +
          'Nothing was applied; the outbox will retry.',
      );
      throw err;
    }
  }
}

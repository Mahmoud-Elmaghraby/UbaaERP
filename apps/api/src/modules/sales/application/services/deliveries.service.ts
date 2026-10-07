import { Inject, Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import { withTransaction } from '../../../../database/tenant/transaction.util';
import { DELIVERY_REPOSITORY, type DeliveryRepository } from '../ports/delivery.repository';
import { DELIVERY_LINE_REPOSITORY, type DeliveryLineRepository } from '../ports/delivery-line.repository';
import { SALES_ORDER_REPOSITORY, type SalesOrderRepository } from '../ports/sales-order.repository';
import {
  SALES_ORDER_LINE_REPOSITORY,
  type SalesOrderLineRepository,
} from '../ports/sales-order-line.repository';
import type {
  Delivery,
  DeliveryWithLines,
  DeliveryStatus,
  CreateDeliveryInput,
  DeliveryLot,
} from '../../domain/delivery.entity';
import { BusinessRuleError, NotFoundError, isPostgresForeignKeyViolation } from '../errors';
import { entityNotFound } from '../../../../shared/errors/entity-errors';
import { NumberingSequencesService } from '../../../settings/application/services/numbering-sequences.service';
import { OutboxWriterService } from '../../../../shared/outbox/application/services/outbox-writer.service';

/**
 * Records physical shipment of goods against a sales order (master doc
 * §10, step 4 — Sales, Stage 4). Structurally the direct mirror of
 * GoodsReceiptsService — same two-step create()/confirm() split, same
 * remaining-quantity validation, same "recompute parent status inside
 * the same transaction as the confirm" shape. See that class's own
 * comment for the reasoning; not repeated here except where this stage
 * differs (no unit cost — see migration 0044's comment).
 *
 * No update() — a wrong draft is cancelled/deleted and recreated rather
 * than edited in place, same precedent as Goods Receipts/Purchase
 * Returns.
 */
@Injectable()
export class DeliveriesService {
  constructor(
    @Inject(DELIVERY_REPOSITORY) private readonly deliveries: DeliveryRepository,
    @Inject(DELIVERY_LINE_REPOSITORY) private readonly lines: DeliveryLineRepository,
    @Inject(SALES_ORDER_REPOSITORY) private readonly salesOrders: SalesOrderRepository,
    @Inject(SALES_ORDER_LINE_REPOSITORY) private readonly salesOrderLines: SalesOrderLineRepository,
    private readonly numberingSequences: NumberingSequencesService,
    private readonly outboxWriter: OutboxWriterService,
  ) {}

  list(db: Kysely<TenantDatabase>): Promise<Delivery[]> {
    return this.deliveries.list(db);
  }

  listBySalesOrderId(db: Kysely<TenantDatabase>, salesOrderId: string): Promise<Delivery[]> {
    return this.deliveries.listBySalesOrderId(db, salesOrderId);
  }

  async getById(db: Kysely<TenantDatabase>, id: string): Promise<DeliveryWithLines> {
    const delivery = await this.deliveries.findById(db, id);
    if (!delivery) throw entityNotFound('DELIVERY', id);
    const lines = await this.lines.listByDeliveryId(db, id);
    return { ...delivery, lines };
  }

  async create(db: Kysely<TenantDatabase>, input: CreateDeliveryInput): Promise<DeliveryWithLines> {
    if (input.lines.length === 0) {
      throw new BusinessRuleError('A delivery must have at least one line.', {
        code: 'DELIVERY.AT_LEAST_ONE_LINE_REQUIRED',
      });
    }

    const order = await this.salesOrders.findById(db, input.salesOrderId);
    if (!order) throw entityNotFound('SALES_ORDER', input.salesOrderId);
    if (order.status !== 'confirmed' && order.status !== 'partially_delivered') {
      throw new BusinessRuleError(
        `Sales order "${input.salesOrderId}" is "${order.status}" — goods can only be delivered against ` +
          'a confirmed (or already partially delivered) sales order.',
        {
          code: 'DELIVERY.SALES_ORDER_NOT_DELIVERABLE',
          params: { id: input.salesOrderId, status: order.status },
        },
      );
    }

    const orderLines = await this.salesOrderLines.listBySalesOrderId(db, order.id);
    const orderLineById = new Map(orderLines.map((line) => [line.id, line]));
    for (const line of input.lines) {
      if (!orderLineById.has(line.salesOrderLineId)) {
        throw new NotFoundError(
          `Sales order line "${line.salesOrderLineId}" was not found on sales order "${order.id}".`,
          {
            code: 'DELIVERY.SALES_ORDER_LINE_NOT_FOUND',
            params: { lineId: line.salesOrderLineId, salesOrderId: order.id },
          },
        );
      }
    }

    const alreadyDelivered = await this.lines.sumDeliveredQuantityBySalesOrderLineIds(
      db,
      input.lines.map((line) => line.salesOrderLineId),
    );
    for (const line of input.lines) {
      const orderLine = orderLineById.get(line.salesOrderLineId)!;
      const delivered = alreadyDelivered[line.salesOrderLineId] ?? 0;
      const remaining = orderLine.quantity - delivered;
      if (line.quantityDelivered > remaining) {
        throw new BusinessRuleError(
          `Cannot deliver ${line.quantityDelivered} against sales order line "${line.salesOrderLineId}" — ` +
            `only ${remaining} remaining (ordered ${orderLine.quantity}, already delivered ${delivered}).`,
          {
            code: 'DELIVERY.QUANTITY_EXCEEDS_REMAINING',
            params: {
              lineId: line.salesOrderLineId,
              quantityDelivered: line.quantityDelivered,
              remaining,
              ordered: orderLine.quantity,
              delivered,
            },
          },
        );
      }
    }

    try {
      return await withTransaction(db, async (trx) => {
        const allocated = await this.numberingSequences.allocateNext(trx, 'delivery', null);

        const delivery = await this.deliveries.create(trx, {
          deliveryNumber: allocated.formatted,
          salesOrderId: order.id,
          warehouseId: input.warehouseId,
          deliveryDate: input.deliveryDate ?? null,
          notes: input.notes ?? null,
          customFields: input.customFields ?? {},
        });

        const createdLines = [];
        for (const line of input.lines) {
          const orderLine = orderLineById.get(line.salesOrderLineId)!;
          createdLines.push(
            await this.lines.create(trx, delivery.id, {
              salesOrderLineId: line.salesOrderLineId,
              productVariantId: orderLine.productVariantId,
              quantityDelivered: line.quantityDelivered,
              notes: line.notes ?? null,
              unitOfMeasureId: orderLine.unitOfMeasureId,
              unitFactor: orderLine.unitFactor,
              lots: normalizeDeliveryLots(line.lots ?? [], line.quantityDelivered, line.salesOrderLineId),
            }),
          );
        }

        return { ...delivery, lines: createdLines };
      });
    } catch (err) {
      if (isPostgresForeignKeyViolation(err)) {
        throw new NotFoundError('The given sales order, sales order line, or warehouse does not exist.', {
          code: 'DELIVERY.SALES_ORDER_OR_LINE_OR_WAREHOUSE_NOT_FOUND',
        });
      }
      if (err instanceof Error && err.message.includes('No numbering sequence configured')) {
        throw new BusinessRuleError(
          'No numbering sequence configured for deliveries yet. ' +
            'Create one for document type "delivery" via Settings → Numbering Sequences first.',
          { code: 'DELIVERY.NO_NUMBERING_SEQUENCE' },
        );
      }
      throw err;
    }
  }

  private async transitionStatus(
    db: Kysely<TenantDatabase>,
    id: string,
    from: DeliveryStatus[],
    to: DeliveryStatus,
  ): Promise<Delivery> {
    const existing = await this.deliveries.findById(db, id);
    if (!existing) throw entityNotFound('DELIVERY', id);
    if (!from.includes(existing.status)) {
      throw new BusinessRuleError(
        `Cannot move delivery "${id}" to "${to}" from its current status "${existing.status}" ` +
          `(expected one of: ${from.join(', ')}).`,
        {
          code: 'DELIVERY.INVALID_STATUS_TRANSITION',
          params: { id, to, from: existing.status, expected: from.join(', ') },
        },
      );
    }
    const updated = await this.deliveries.updateStatus(db, id, to);
    if (!updated) throw entityNotFound('DELIVERY', id);
    return updated;
  }

  /**
   * The one-way door: marks the delivery confirmed and recomputes the
   * parent sales order's status from total delivered quantity across
   * every confirmed delivery (including this one) — same transaction,
   * same reasoning as GoodsReceiptsService.confirm(). Publishing the
   * Event Bus integration event that actually moves stock is the
   * caller's job (the controller), using the lines this method returns.
   */
  /**
   * The one-way door. Writes the 'sales.delivery.confirmed' integration
   * event to the Outbox (CLAUDE.md §2.7), in the SAME transaction as the
   * status flip and the parent sales order's status recompute — this
   * event now feeds Inventory's stock decrease AND, transitively via
   * Inventory's own follow-on event, Accounting's COGS auto-posting
   * (Stage 6), so it needs the same never-silently-lost guarantee every
   * other financial-adjacent event in this codebase gets. The controller
   * no longer calls SalesEventPublisher.publish() for this action — see
   * PurchaseInvoicesService.post()'s own comment for why a dispatcher-
   * delivered event and a direct publish() call are indistinguishable to
   * any @OnEvent listener.
   */
  async confirm(
    db: Kysely<TenantDatabase>,
    id: string,
    schema: string,
    actorUserId: string | null,
  ): Promise<DeliveryWithLines> {
    const existing = await this.deliveries.findById(db, id);
    if (!existing) throw entityNotFound('DELIVERY', id);
    if (existing.status !== 'draft') {
      throw new BusinessRuleError(
        `Cannot confirm delivery "${id}" from its current status "${existing.status}" (expected "draft").`,
        { code: 'DELIVERY.NOT_CONFIRMABLE', params: { id, status: existing.status } },
      );
    }

    return withTransaction(db, async (trx) => {
      const updated = await this.deliveries.updateStatus(trx, id, 'confirmed');
      if (!updated) throw entityNotFound('DELIVERY', id);
      const lines = await this.lines.listByDeliveryId(trx, id);

      const order = await this.salesOrders.findById(trx, updated.salesOrderId);
      if (order) {
        const orderLines = await this.salesOrderLines.listBySalesOrderId(trx, order.id);
        const deliveredByLine = await this.lines.sumDeliveredQuantityBySalesOrderLineIds(
          trx,
          orderLines.map((line) => line.id),
        );
        const fullyDelivered = orderLines.every((line) => (deliveredByLine[line.id] ?? 0) >= line.quantity);
        const newOrderStatus = fullyDelivered ? 'fully_delivered' : 'partially_delivered';
        if (order.status !== newOrderStatus) {
          await this.salesOrders.updateStatus(trx, order.id, newOrderStatus);
        }
      }

      await this.outboxWriter.write(trx, 'sales.delivery.confirmed', {
        schema,
        entityType: 'delivery',
        entityId: updated.id,
        action: 'confirmed',
        actorUserId,
        metadata: {
          salesOrderId: updated.salesOrderId,
          warehouseId: updated.warehouseId,
          lines: lines.map((line) => ({
            productVariantId: line.productVariantId,
            // Inventory counts in the product's base unit (a carton line of 2 × 12 → 24).
            quantity: toBase(line.quantityDelivered, line.unitFactor),
            lots: line.lots.map((lot) => ({ ...lot, quantity: toBase(lot.quantity, line.unitFactor) })),
          })),
        },
        occurredAt: new Date(),
      });

      return { ...updated, lines };
    });
  }

  cancel(db: Kysely<TenantDatabase>, id: string): Promise<Delivery> {
    return this.transitionStatus(db, id, ['draft'], 'cancelled');
  }

  async delete(db: Kysely<TenantDatabase>, id: string): Promise<void> {
    const existing = await this.deliveries.findById(db, id);
    if (!existing) throw entityNotFound('DELIVERY', id);
    if (existing.status !== 'draft' && existing.status !== 'cancelled') {
      throw new BusinessRuleError(`Delivery "${id}" is "${existing.status}" and cannot be deleted.`, {
        code: 'DELIVERY.NOT_DELETABLE',
        params: { id, status: existing.status },
      });
    }
    await this.deliveries.delete(db, id);
  }
}

/**
 * Picked lots are optional; when given they must add up to the delivered
 * quantity. Whether each lot exists, has stock and is unexpired is
 * Inventory's call when the delivery is confirmed.
 */
export function normalizeDeliveryLots(lots: DeliveryLot[], quantity: number, lineRef: string): DeliveryLot[] {
  if (lots.length === 0) return [];
  const merged = new Map<string, number>();
  for (const lot of lots) {
    const lotNumber = lot.lotNumber.trim();
    if (!lotNumber || !(lot.quantity > 0)) {
      throw new BusinessRuleError('Every picked lot needs a number and a quantity greater than zero.', {
        code: 'DELIVERY.INVALID_LOT',
        params: { lineId: lineRef },
      });
    }
    merged.set(lotNumber, (merged.get(lotNumber) ?? 0) + lot.quantity);
  }
  const result = [...merged].map(([lotNumber, qty]) => ({ lotNumber, quantity: qty }));
  const total = result.reduce((sum, lot) => sum + lot.quantity, 0);
  if (Math.abs(total - quantity) > 1e-6) {
    throw new BusinessRuleError(`The picked lots add up to ${total}, but the delivered quantity is ${quantity}.`, {
      code: 'DELIVERY.LOTS_QUANTITY_MISMATCH',
      params: { lineId: lineRef, total, quantity },
    });
  }
  return result;
}

function toBase(quantity: number, unitFactor: number): number {
  return Math.round(quantity * unitFactor * 10_000) / 10_000;
}

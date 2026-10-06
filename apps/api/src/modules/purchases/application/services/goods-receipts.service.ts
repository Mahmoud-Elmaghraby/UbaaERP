import { Inject, Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import { withTransaction } from '../../../../database/tenant/transaction.util';
import { GOODS_RECEIPT_REPOSITORY, type GoodsReceiptRepository } from '../ports/goods-receipt.repository';
import {
  GOODS_RECEIPT_LINE_REPOSITORY,
  type GoodsReceiptLineRepository,
} from '../ports/goods-receipt-line.repository';
import { PURCHASE_ORDER_REPOSITORY, type PurchaseOrderRepository } from '../ports/purchase-order.repository';
import {
  PURCHASE_ORDER_LINE_REPOSITORY,
  type PurchaseOrderLineRepository,
} from '../ports/purchase-order-line.repository';
import type {
  GoodsReceipt,
  GoodsReceiptWithLines,
  GoodsReceiptStatus,
  CreateGoodsReceiptInput,
  ReceiptLot,
} from '../../domain/goods-receipt.entity';
import { PRODUCT_TRACKING_READER, type ProductTrackingReader } from '../ports/product-tracking.reader';
import { BusinessRuleError, NotFoundError, isPostgresForeignKeyViolation } from '../errors';
import { entityNotFound } from '../../../../shared/errors/entity-errors';
import { NumberingSequencesService } from '../../../settings/application/services/numbering-sequences.service';
import { OutboxWriterService } from '../../../../shared/outbox/application/services/outbox-writer.service';

/**
 * Records physical receipt of goods against a purchase order (master doc
 * §10, step 3 — Purchases, Stage 5).
 *
 * Two-step by design, like every other document in this module:
 * create() persists a 'draft' receipt and validates it against what the
 * PO still has outstanding, but has NO side effect on stock yet.
 * confirm() is the one-way door that (a) writes
 * 'purchases.goods_receipt.confirmed' to the Outbox (CLAUDE.md §2.7), in
 * the SAME transaction as the status flip — Inventory's
 * GoodsReceiptStockListener is what actually increases stock once
 * OutboxDispatcherService relays the event, never a direct call from here
 * (CLAUDE.md §2.6) — and (b) recomputes the parent PO's status
 * (partially_received / fully_received) from total received quantity
 * across every confirmed receipt.
 *
 * Outbox symmetry (claude/next-steps-backlog.md item 2): this used to
 * rely on GoodsReceiptsController publishing the event on the plain Event
 * Bus after the transaction committed — the one asymmetry left over from
 * before Purchase Invoices' invoice-takeover orchestrator needed to call
 * confirm() directly (bypassing the controller), which PurchaseInvoicesService
 * had to work around by replicating the controller's publish() call itself.
 * Moving the write into confirm()'s own transaction (mirroring
 * DeliveriesService.confirm(), Sales' structurally-identical sibling)
 * removes both the asymmetry and the workaround: any caller of confirm()
 * now gets the event for free, atomically, with no risk of a receipt
 * marked "confirmed" that silently never told Inventory.
 *
 * No update() — a wrong draft is cancelled/deleted and recreated rather
 * than edited in place; keeps this stage's scope tight (see
 * claude/purchases-module-status.md's Stage 5 write-up).
 */
@Injectable()
export class GoodsReceiptsService {
  constructor(
    @Inject(GOODS_RECEIPT_REPOSITORY) private readonly receipts: GoodsReceiptRepository,
    @Inject(GOODS_RECEIPT_LINE_REPOSITORY) private readonly lines: GoodsReceiptLineRepository,
    @Inject(PURCHASE_ORDER_REPOSITORY) private readonly purchaseOrders: PurchaseOrderRepository,
    @Inject(PURCHASE_ORDER_LINE_REPOSITORY) private readonly purchaseOrderLines: PurchaseOrderLineRepository,
    private readonly numberingSequences: NumberingSequencesService,
    private readonly outboxWriter: OutboxWriterService,
    @Inject(PRODUCT_TRACKING_READER) private readonly tracking: ProductTrackingReader,
  ) {}

  list(db: Kysely<TenantDatabase>): Promise<GoodsReceipt[]> {
    return this.receipts.list(db);
  }

  listByPurchaseOrderId(db: Kysely<TenantDatabase>, purchaseOrderId: string): Promise<GoodsReceipt[]> {
    return this.receipts.listByPurchaseOrderId(db, purchaseOrderId);
  }

  async getById(db: Kysely<TenantDatabase>, id: string): Promise<GoodsReceiptWithLines> {
    const receipt = await this.receipts.findById(db, id);
    if (!receipt) throw entityNotFound('GOODS_RECEIPT', id);
    const lines = await this.lines.listByGoodsReceiptId(db, id);
    return { ...receipt, lines };
  }

  async create(db: Kysely<TenantDatabase>, input: CreateGoodsReceiptInput): Promise<GoodsReceiptWithLines> {
    if (input.lines.length === 0) {
      throw new BusinessRuleError('A goods receipt must have at least one line.', {
        code: 'GOODS_RECEIPT.AT_LEAST_ONE_LINE_REQUIRED',
      });
    }

    const po = await this.purchaseOrders.findById(db, input.purchaseOrderId);
    if (!po) throw entityNotFound('PURCHASE_ORDER', input.purchaseOrderId);
    if (po.status !== 'confirmed' && po.status !== 'partially_received') {
      throw new BusinessRuleError(
        `Purchase order "${input.purchaseOrderId}" is "${po.status}" — goods can only be received against ` +
          'a confirmed (or already partially received) purchase order.',
        {
          code: 'GOODS_RECEIPT.PURCHASE_ORDER_NOT_RECEIVABLE',
          params: { id: input.purchaseOrderId, status: po.status },
        },
      );
    }

    const poLines = await this.purchaseOrderLines.listByPurchaseOrderId(db, po.id);
    const poLineById = new Map(poLines.map((line) => [line.id, line]));
    for (const line of input.lines) {
      if (!poLineById.has(line.purchaseOrderLineId)) {
        throw new NotFoundError(
          `Purchase order line "${line.purchaseOrderLineId}" was not found on purchase order "${po.id}".`,
          {
            code: 'GOODS_RECEIPT.PURCHASE_ORDER_LINE_NOT_FOUND',
            params: { lineId: line.purchaseOrderLineId, purchaseOrderId: po.id },
          },
        );
      }
    }

    const alreadyReceived = await this.lines.sumReceivedQuantityByPurchaseOrderLineIds(
      db,
      input.lines.map((line) => line.purchaseOrderLineId),
    );
    for (const line of input.lines) {
      const poLine = poLineById.get(line.purchaseOrderLineId)!;
      const received = alreadyReceived[line.purchaseOrderLineId] ?? 0;
      const remaining = poLine.quantity - received;
      if (line.quantityReceived > remaining) {
        throw new BusinessRuleError(
          `Cannot receive ${line.quantityReceived} against purchase order line "${line.purchaseOrderLineId}" — ` +
            `only ${remaining} remaining (ordered ${poLine.quantity}, already received ${received}).`,
          {
            code: 'GOODS_RECEIPT.QUANTITY_EXCEEDS_REMAINING',
            params: {
              lineId: line.purchaseOrderLineId,
              quantityReceived: line.quantityReceived,
              remaining,
              ordered: poLine.quantity,
              received,
            },
          },
        );
      }
    }

    const trackingByVariant = await this.tracking.trackingTypes(
      db,
      input.lines.map((line) => poLineById.get(line.purchaseOrderLineId)!.productVariantId),
    );
    const lotsByIndex = input.lines.map((line) =>
      normalizeReceiptLots(
        line.lots ?? [],
        line.quantityReceived,
        trackingByVariant.get(poLineById.get(line.purchaseOrderLineId)!.productVariantId) ?? 'none',
        line.purchaseOrderLineId,
      ),
    );

    try {
      // withTransaction, not db.transaction(): PurchaseInvoicesService calls
      // this with its own open trx when Goods Receipts is disabled, and
      // Kysely throws on Transaction.transaction().
      return await withTransaction(db, async (trx) => {
        const allocated = await this.numberingSequences.allocateNext(trx, 'goods_receipt', null);

        const receipt = await this.receipts.create(trx, {
          receiptNumber: allocated.formatted,
          purchaseOrderId: po.id,
          warehouseId: input.warehouseId,
          receivedDate: input.receivedDate ?? null,
          notes: input.notes ?? null,
          customFields: input.customFields ?? {},
        });

        const createdLines = [];
        for (const [index, line] of input.lines.entries()) {
          const poLine = poLineById.get(line.purchaseOrderLineId)!;
          createdLines.push(
            await this.lines.create(trx, receipt.id, {
              purchaseOrderLineId: line.purchaseOrderLineId,
              productVariantId: poLine.productVariantId,
              quantityReceived: line.quantityReceived,
              unitCost: line.unitCost ?? poLine.unitPrice,
              notes: line.notes ?? null,
              lots: lotsByIndex[index]!,
            }),
          );
        }

        return { ...receipt, lines: createdLines };
      });
    } catch (err) {
      if (isPostgresForeignKeyViolation(err)) {
        throw new NotFoundError('The given purchase order, purchase order line, or warehouse does not exist.', {
          code: 'GOODS_RECEIPT.PO_OR_LINE_OR_WAREHOUSE_NOT_FOUND',
        });
      }
      if (err instanceof Error && err.message.includes('No numbering sequence configured')) {
        throw new BusinessRuleError(
          'No numbering sequence configured for goods receipts yet. ' +
            'Create one for document type "goods_receipt" via Settings → Numbering Sequences first.',
          { code: 'GOODS_RECEIPT.NO_NUMBERING_SEQUENCE' },
        );
      }
      throw err;
    }
  }

  private async transitionStatus(
    db: Kysely<TenantDatabase>,
    id: string,
    from: GoodsReceiptStatus[],
    to: GoodsReceiptStatus,
  ): Promise<GoodsReceipt> {
    const existing = await this.receipts.findById(db, id);
    if (!existing) throw entityNotFound('GOODS_RECEIPT', id);
    if (!from.includes(existing.status)) {
      throw new BusinessRuleError(
        `Cannot move goods receipt "${id}" to "${to}" from its current status "${existing.status}" ` +
          `(expected one of: ${from.join(', ')}).`,
        {
          code: 'GOODS_RECEIPT.INVALID_STATUS_TRANSITION',
          params: { id, to, from: existing.status, expected: from.join(', ') },
        },
      );
    }
    const updated = await this.receipts.updateStatus(db, id, to);
    if (!updated) throw entityNotFound('GOODS_RECEIPT', id);
    return updated;
  }

  /**
   * The one-way door: marks the receipt confirmed, recomputes the parent
   * PO's status from total received quantity across every confirmed
   * receipt (including this one), and writes the
   * 'purchases.goods_receipt.confirmed' integration event to the Outbox —
   * all in the SAME transaction, so the PO status, the outbox record, and
   * the status flip can never disagree with each other or be silently
   * lost. `withTransaction` means a caller that already has an open `trx`
   * (the Purchase Invoices invoice-takeover orchestrator) gets this event
   * folded into its own atomic unit of work instead of opening a nested
   * transaction — see PurchaseInvoicesService.create()'s own comment.
   */
  async confirm(
    db: Kysely<TenantDatabase>,
    id: string,
    schema: string,
    actorUserId: string | null,
  ): Promise<GoodsReceiptWithLines> {
    const existing = await this.receipts.findById(db, id);
    if (!existing) throw entityNotFound('GOODS_RECEIPT', id);
    if (existing.status !== 'draft') {
      throw new BusinessRuleError(
        `Cannot confirm goods receipt "${id}" from its current status "${existing.status}" (expected "draft").`,
        { code: 'GOODS_RECEIPT.NOT_CONFIRMABLE', params: { id, status: existing.status } },
      );
    }

    return withTransaction(db, async (trx) => {
      const updated = await this.receipts.updateStatus(trx, id, 'confirmed');
      if (!updated) throw entityNotFound('GOODS_RECEIPT', id);
      const lines = await this.lines.listByGoodsReceiptId(trx, id);

      const po = await this.purchaseOrders.findById(trx, updated.purchaseOrderId);
      if (po) {
        const poLines = await this.purchaseOrderLines.listByPurchaseOrderId(trx, po.id);
        const receivedByLine = await this.lines.sumReceivedQuantityByPurchaseOrderLineIds(
          trx,
          poLines.map((line) => line.id),
        );
        const fullyReceived = poLines.every((line) => (receivedByLine[line.id] ?? 0) >= line.quantity);
        const newPoStatus = fullyReceived ? 'fully_received' : 'partially_received';
        if (po.status !== newPoStatus) {
          await this.purchaseOrders.updateStatus(trx, po.id, newPoStatus);
        }
      }

      await this.outboxWriter.write(trx, 'purchases.goods_receipt.confirmed', {
        schema,
        entityType: 'goods_receipt',
        entityId: updated.id,
        action: 'confirmed',
        actorUserId,
        metadata: {
          purchaseOrderId: updated.purchaseOrderId,
          warehouseId: updated.warehouseId,
          lines: lines.map((line) => ({
            productVariantId: line.productVariantId,
            quantity: line.quantityReceived,
            unitCost: { amountMinorUnits: line.unitCost.toMinorUnits().toString(), currency: line.unitCost.currency },
            lots: line.lots,
          })),
        },
        occurredAt: new Date(),
      });

      return { ...updated, lines };
    });
  }

  cancel(db: Kysely<TenantDatabase>, id: string): Promise<GoodsReceipt> {
    return this.transitionStatus(db, id, ['draft'], 'cancelled');
  }

  async delete(db: Kysely<TenantDatabase>, id: string): Promise<void> {
    const existing = await this.receipts.findById(db, id);
    if (!existing) throw entityNotFound('GOODS_RECEIPT', id);
    if (existing.status !== 'draft' && existing.status !== 'cancelled') {
      throw new BusinessRuleError(`Goods receipt "${id}" is "${existing.status}" and cannot be deleted.`, {
        code: 'GOODS_RECEIPT.NOT_DELETABLE',
        params: { id, status: existing.status },
      });
    }
    await this.receipts.delete(db, id);
  }
}

const QUANTITY_EPSILON = 1e-6;

/**
 * Validates and normalizes the lot split of one receipt line:
 *  - lot/serial-tracked items MUST carry lots whose quantities add up to the
 *    received quantity (otherwise Inventory could not record the movement —
 *    audit finding C2);
 *  - serial-tracked items: one unit per serial number;
 *  - untracked items must not carry lots (they would be silently ignored).
 * Lot numbers are trimmed; the same lot number twice on one line is merged
 * only if the expiry dates agree.
 */
export function normalizeReceiptLots(
  lots: ReceiptLot[],
  quantityReceived: number,
  trackingType: 'none' | 'lot' | 'serial',
  lineRef: string,
): ReceiptLot[] {
  if (trackingType === 'none') {
    if (lots.length > 0) {
      throw new BusinessRuleError('This item is not lot/serial-tracked, so its line must not carry lots.', {
        code: 'GOODS_RECEIPT.LOTS_NOT_TRACKED',
        params: { lineId: lineRef },
      });
    }
    return [];
  }
  if (lots.length === 0) {
    throw new BusinessRuleError(
      `Line "${lineRef}" is ${trackingType}-tracked — enter the ${trackingType === 'serial' ? 'serial numbers' : 'lot numbers'} received.`,
      {
        code: trackingType === 'serial' ? 'GOODS_RECEIPT.SERIALS_REQUIRED' : 'GOODS_RECEIPT.LOTS_REQUIRED',
        params: { lineId: lineRef },
      },
    );
  }
  const merged = new Map<string, ReceiptLot>();
  for (const lot of lots) {
    const lotNumber = lot.lotNumber.trim();
    if (!lotNumber || !(lot.quantity > 0)) {
      throw new BusinessRuleError('Every lot needs a number and a quantity greater than zero.', {
        code: 'GOODS_RECEIPT.INVALID_LOT',
        params: { lineId: lineRef },
      });
    }
    if (trackingType === 'serial' && lot.quantity !== 1) {
      throw new BusinessRuleError(`Serial "${lotNumber}" must have a quantity of exactly 1.`, {
        code: 'GOODS_RECEIPT.SERIAL_QUANTITY_MUST_BE_ONE',
        params: { lineId: lineRef, lotNumber },
      });
    }
    const expiryDate = lot.expiryDate || null;
    const existing = merged.get(lotNumber);
    if (existing) {
      if (trackingType === 'serial') {
        throw new BusinessRuleError(`Serial "${lotNumber}" is entered twice.`, {
          code: 'GOODS_RECEIPT.DUPLICATE_SERIAL',
          params: { lineId: lineRef, lotNumber },
        });
      }
      if (existing.expiryDate !== expiryDate) {
        throw new BusinessRuleError(`Lot "${lotNumber}" is entered twice with different expiry dates.`, {
          code: 'GOODS_RECEIPT.LOT_EXPIRY_CONFLICT',
          params: { lineId: lineRef, lotNumber },
        });
      }
      existing.quantity += lot.quantity;
    } else {
      merged.set(lotNumber, { lotNumber, expiryDate, quantity: lot.quantity });
    }
  }
  const result = [...merged.values()];
  const total = result.reduce((sum, lot) => sum + lot.quantity, 0);
  if (Math.abs(total - quantityReceived) > QUANTITY_EPSILON) {
    throw new BusinessRuleError(
      `The lots on line "${lineRef}" add up to ${total}, but the received quantity is ${quantityReceived}.`,
      {
        code: 'GOODS_RECEIPT.LOTS_QUANTITY_MISMATCH',
        params: { lineId: lineRef, total, quantity: quantityReceived },
      },
    );
  }
  return result;
}

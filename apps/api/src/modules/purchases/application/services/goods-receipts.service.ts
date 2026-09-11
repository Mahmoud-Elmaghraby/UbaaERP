import { Inject, Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
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
} from '../../domain/goods-receipt.entity';
import { BusinessRuleError, NotFoundError, isPostgresForeignKeyViolation } from '../errors';
import { entityNotFound } from '../../../../shared/errors/entity-errors';
import { NumberingSequencesService } from '../../../settings/application/services/numbering-sequences.service';

/**
 * Records physical receipt of goods against a purchase order (master doc
 * §10, step 3 — Purchases, Stage 5).
 *
 * Two-step by design, like every other document in this module:
 * create() persists a 'draft' receipt and validates it against what the
 * PO still has outstanding, but has NO side effect on stock yet.
 * confirm() is the one-way door that (a) publishes
 * 'purchases.goods_receipt.confirmed' on the Event Bus — Inventory's
 * GoodsReceiptStockListener is what actually increases stock, never a
 * direct call from here (CLAUDE.md §2.6) — and (b) recomputes the parent
 * PO's status (partially_received / fully_received) from total received
 * quantity across every confirmed receipt.
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

    try {
      return await db.transaction().execute(async (trx) => {
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
        for (const line of input.lines) {
          const poLine = poLineById.get(line.purchaseOrderLineId)!;
          createdLines.push(
            await this.lines.create(trx, receipt.id, {
              purchaseOrderLineId: line.purchaseOrderLineId,
              productVariantId: poLine.productVariantId,
              quantityReceived: line.quantityReceived,
              unitCost: line.unitCost ?? poLine.unitPrice,
              notes: line.notes ?? null,
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
   * The one-way door: marks the receipt confirmed and recomputes the
   * parent PO's status from total received quantity across every
   * confirmed receipt (including this one). Both writes happen in one
   * transaction so the PO status can never disagree with what's actually
   * been confirmed. Publishing the Event Bus integration event that
   * actually moves stock is the caller's job (the controller — see
   * PurchasesEventPublisher usage on every other stage's confirm/select
   * action), using the lines this method returns.
   */
  async confirm(db: Kysely<TenantDatabase>, id: string): Promise<GoodsReceiptWithLines> {
    const existing = await this.receipts.findById(db, id);
    if (!existing) throw entityNotFound('GOODS_RECEIPT', id);
    if (existing.status !== 'draft') {
      throw new BusinessRuleError(
        `Cannot confirm goods receipt "${id}" from its current status "${existing.status}" (expected "draft").`,
        { code: 'GOODS_RECEIPT.NOT_CONFIRMABLE', params: { id, status: existing.status } },
      );
    }

    return db.transaction().execute(async (trx) => {
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

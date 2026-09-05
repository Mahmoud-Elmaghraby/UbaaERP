import { Inject, Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import { PURCHASE_RETURN_REPOSITORY, type PurchaseReturnRepository } from '../ports/purchase-return.repository';
import {
  PURCHASE_RETURN_LINE_REPOSITORY,
  type PurchaseReturnLineRepository,
} from '../ports/purchase-return-line.repository';
import { GOODS_RECEIPT_REPOSITORY, type GoodsReceiptRepository } from '../ports/goods-receipt.repository';
import {
  GOODS_RECEIPT_LINE_REPOSITORY,
  type GoodsReceiptLineRepository,
} from '../ports/goods-receipt-line.repository';
import type {
  PurchaseReturn,
  PurchaseReturnWithLines,
  PurchaseReturnConfirmation,
  PurchaseReturnStatus,
  CreatePurchaseReturnInput,
} from '../../domain/purchase-return.entity';
import { BusinessRuleError, NotFoundError, isPostgresForeignKeyViolation } from '../errors';
import { NumberingSequencesService } from '../../../settings/application/services/numbering-sequences.service';

/**
 * Records goods physically sent back to a supplier after a confirmed
 * goods receipt (master doc §10, step 3 — Purchases, Stage 6; the
 * second approved research-pass addition). Scoped to the physical
 * return only, not a financial debit note — see
 * claude/purchases-module-status.md's Stage 6 write-up.
 *
 * Same two-step shape as Goods Receipts: create() persists a 'draft'
 * return, already validated against how much of the referenced goods
 * receipt lines can still be returned, but with no stock effect.
 * confirm() is the one-way door that publishes the Event Bus
 * integration event PurchaseReturnStockListener (in the inventory
 * module) consumes to actually decrease stock — never a direct call
 * into Inventory (CLAUDE.md §2.6).
 *
 * Deliberately does NOT touch the parent purchase order's
 * partially_received/fully_received status — that status reflects what
 * was received (a historical fact), not "received minus returned".
 * Reopening that state machine on a return is a real design option but
 * out of scope here; flagged in the status doc, not silently decided.
 */
@Injectable()
export class PurchaseReturnsService {
  constructor(
    @Inject(PURCHASE_RETURN_REPOSITORY) private readonly returns: PurchaseReturnRepository,
    @Inject(PURCHASE_RETURN_LINE_REPOSITORY) private readonly lines: PurchaseReturnLineRepository,
    @Inject(GOODS_RECEIPT_REPOSITORY) private readonly goodsReceipts: GoodsReceiptRepository,
    @Inject(GOODS_RECEIPT_LINE_REPOSITORY) private readonly goodsReceiptLines: GoodsReceiptLineRepository,
    private readonly numberingSequences: NumberingSequencesService,
  ) {}

  list(db: Kysely<TenantDatabase>): Promise<PurchaseReturn[]> {
    return this.returns.list(db);
  }

  listByGoodsReceiptId(db: Kysely<TenantDatabase>, goodsReceiptId: string): Promise<PurchaseReturn[]> {
    return this.returns.listByGoodsReceiptId(db, goodsReceiptId);
  }

  async getById(db: Kysely<TenantDatabase>, id: string): Promise<PurchaseReturnWithLines> {
    const purchaseReturn = await this.returns.findById(db, id);
    if (!purchaseReturn) throw new NotFoundError(`Purchase return "${id}" not found.`);
    const lines = await this.lines.listByPurchaseReturnId(db, id);
    return { ...purchaseReturn, lines };
  }

  async create(db: Kysely<TenantDatabase>, input: CreatePurchaseReturnInput): Promise<PurchaseReturnWithLines> {
    if (input.lines.length === 0) {
      throw new BusinessRuleError('A purchase return must have at least one line.');
    }

    const goodsReceipt = await this.goodsReceipts.findById(db, input.goodsReceiptId);
    if (!goodsReceipt) throw new NotFoundError(`Goods receipt "${input.goodsReceiptId}" not found.`);
    if (goodsReceipt.status !== 'confirmed') {
      throw new BusinessRuleError(
        `Goods receipt "${input.goodsReceiptId}" is "${goodsReceipt.status}" — only a confirmed goods receipt ` +
          '(one that actually arrived in stock) can have anything returned against it.',
      );
    }

    const receiptLines = await this.goodsReceiptLines.listByGoodsReceiptId(db, goodsReceipt.id);
    const receiptLineById = new Map(receiptLines.map((line) => [line.id, line]));
    for (const line of input.lines) {
      if (!receiptLineById.has(line.goodsReceiptLineId)) {
        throw new NotFoundError(
          `Goods receipt line "${line.goodsReceiptLineId}" was not found on goods receipt "${goodsReceipt.id}".`,
        );
      }
    }

    const alreadyReturned = await this.lines.sumReturnedQuantityByGoodsReceiptLineIds(
      db,
      input.lines.map((line) => line.goodsReceiptLineId),
    );
    for (const line of input.lines) {
      const receiptLine = receiptLineById.get(line.goodsReceiptLineId)!;
      const returned = alreadyReturned[line.goodsReceiptLineId] ?? 0;
      const remaining = receiptLine.quantityReceived - returned;
      if (line.quantityReturned > remaining) {
        throw new BusinessRuleError(
          `Cannot return ${line.quantityReturned} against goods receipt line "${line.goodsReceiptLineId}" — ` +
            `only ${remaining} remaining returnable (received ${receiptLine.quantityReceived}, already returned ${returned}).`,
        );
      }
    }

    try {
      return await db.transaction().execute(async (trx) => {
        const allocated = await this.numberingSequences.allocateNext(trx, 'purchase_return', null);

        const purchaseReturn = await this.returns.create(trx, {
          returnNumber: allocated.formatted,
          goodsReceiptId: goodsReceipt.id,
          returnDate: input.returnDate ?? null,
          notes: input.notes ?? null,
          customFields: input.customFields ?? {},
        });

        const createdLines = [];
        for (const line of input.lines) {
          const receiptLine = receiptLineById.get(line.goodsReceiptLineId)!;
          createdLines.push(
            await this.lines.create(trx, purchaseReturn.id, {
              goodsReceiptLineId: line.goodsReceiptLineId,
              productVariantId: receiptLine.productVariantId,
              quantityReturned: line.quantityReturned,
              reason: line.reason ?? null,
              notes: line.notes ?? null,
            }),
          );
        }

        return { ...purchaseReturn, lines: createdLines };
      });
    } catch (err) {
      if (isPostgresForeignKeyViolation(err)) {
        throw new NotFoundError('The given goods receipt or goods receipt line does not exist.');
      }
      if (err instanceof Error && err.message.includes('No numbering sequence configured')) {
        throw new BusinessRuleError(
          'No numbering sequence configured for purchase returns yet. ' +
            'Create one for document type "purchase_return" via Settings → Numbering Sequences first.',
        );
      }
      throw err;
    }
  }

  /**
   * The one-way door. Returns the goods receipt's warehouseId alongside
   * the confirmed return (see PurchaseReturnConfirmation's comment) so
   * the controller can build the stock-decrease event without a second
   * round trip.
   */
  async confirm(db: Kysely<TenantDatabase>, id: string): Promise<PurchaseReturnConfirmation> {
    const existing = await this.returns.findById(db, id);
    if (!existing) throw new NotFoundError(`Purchase return "${id}" not found.`);
    if (existing.status !== 'draft') {
      throw new BusinessRuleError(
        `Cannot confirm purchase return "${id}" from its current status "${existing.status}" (expected "draft").`,
      );
    }

    const updated = await this.returns.updateStatus(db, id, 'confirmed');
    if (!updated) throw new NotFoundError(`Purchase return "${id}" not found.`);
    const lines = await this.lines.listByPurchaseReturnId(db, id);

    const goodsReceipt = await this.goodsReceipts.findById(db, updated.goodsReceiptId);
    if (!goodsReceipt) {
      throw new NotFoundError(`Goods receipt "${updated.goodsReceiptId}" not found.`);
    }

    return { ...updated, lines, warehouseId: goodsReceipt.warehouseId };
  }

  private async transitionStatus(
    db: Kysely<TenantDatabase>,
    id: string,
    from: PurchaseReturnStatus[],
    to: PurchaseReturnStatus,
  ): Promise<PurchaseReturn> {
    const existing = await this.returns.findById(db, id);
    if (!existing) throw new NotFoundError(`Purchase return "${id}" not found.`);
    if (!from.includes(existing.status)) {
      throw new BusinessRuleError(
        `Cannot move purchase return "${id}" to "${to}" from its current status "${existing.status}" ` +
          `(expected one of: ${from.join(', ')}).`,
      );
    }
    const updated = await this.returns.updateStatus(db, id, to);
    if (!updated) throw new NotFoundError(`Purchase return "${id}" not found.`);
    return updated;
  }

  cancel(db: Kysely<TenantDatabase>, id: string): Promise<PurchaseReturn> {
    return this.transitionStatus(db, id, ['draft'], 'cancelled');
  }

  async delete(db: Kysely<TenantDatabase>, id: string): Promise<void> {
    const existing = await this.returns.findById(db, id);
    if (!existing) throw new NotFoundError(`Purchase return "${id}" not found.`);
    if (existing.status !== 'draft' && existing.status !== 'cancelled') {
      throw new BusinessRuleError(`Purchase return "${id}" is "${existing.status}" and cannot be deleted.`);
    }
    await this.returns.delete(db, id);
  }
}

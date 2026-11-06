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
import { PurchaseDebitNotesService } from './purchase-debit-notes.service';
import { BusinessRuleError, NotFoundError, isPostgresForeignKeyViolation } from '../errors';
import { entityNotFound, statusChanged } from '../../../../shared/errors/entity-errors';
import { lockRowsForUpdate } from '../../../../shared/persistence/row-locks';
import type { GoodsReceiptLine } from '../../domain/goods-receipt.entity';
import { findQuantityExcess, inLineUnit, toBaseQuantity } from './quantity-limits';
import { NumberingSequencesService } from '../../../settings/application/services/numbering-sequences.service';
import { OutboxWriterService } from '../../../../shared/outbox/application/services/outbox-writer.service';
import { withTransaction } from '../../../../database/tenant/transaction.util';
import { StockAvailabilityChecker } from '../../../../shared/catalog/stock-availability-checker';
import { CurrencyRateReader } from '../../../../shared/catalog/currency-rate-reader';
import { valueInTenantCurrency } from './goods-receipts.service';

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
 * confirm() is the one-way door that writes (via the Outbox) the
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
    private readonly outboxWriter: OutboxWriterService,
    private readonly stockChecker: StockAvailabilityChecker,
    private readonly debitNotes: PurchaseDebitNotesService,
  ) {}

  /** Plain read helper (no dependencies) — not injected, so the wiring is unchanged. */
  private readonly currencyRates = new CurrencyRateReader();

  list(db: Kysely<TenantDatabase>): Promise<PurchaseReturn[]> {
    return this.returns.list(db);
  }

  listByGoodsReceiptId(db: Kysely<TenantDatabase>, goodsReceiptId: string): Promise<PurchaseReturn[]> {
    return this.returns.listByGoodsReceiptId(db, goodsReceiptId);
  }

  async getById(db: Kysely<TenantDatabase>, id: string): Promise<PurchaseReturnWithLines> {
    const purchaseReturn = await this.returns.findById(db, id);
    if (!purchaseReturn) throw entityNotFound('PURCHASE_RETURN', id);
    const lines = await this.lines.listByPurchaseReturnId(db, id);
    return { ...purchaseReturn, lines };
  }

  async create(db: Kysely<TenantDatabase>, input: CreatePurchaseReturnInput): Promise<PurchaseReturnWithLines> {
    if (input.lines.length === 0) {
      throw new BusinessRuleError('A purchase return must have at least one line.', {
        code: 'PURCHASE_RETURN.AT_LEAST_ONE_LINE_REQUIRED',
      });
    }

    const goodsReceipt = await this.goodsReceipts.findById(db, input.goodsReceiptId);
    if (!goodsReceipt) throw entityNotFound('GOODS_RECEIPT', input.goodsReceiptId);
    if (goodsReceipt.status !== 'confirmed') {
      throw new BusinessRuleError(
        `Goods receipt "${input.goodsReceiptId}" is "${goodsReceipt.status}" — only a confirmed goods receipt ` +
          '(one that actually arrived in stock) can have anything returned against it.',
        {
          code: 'PURCHASE_RETURN.GOODS_RECEIPT_NOT_CONFIRMED',
          params: { id: input.goodsReceiptId, status: goodsReceipt.status },
        },
      );
    }

    const receiptLines = await this.goodsReceiptLines.listByGoodsReceiptId(db, goodsReceipt.id);
    const receiptLineById = new Map(receiptLines.map((line) => [line.id, line]));
    for (const line of input.lines) {
      if (!receiptLineById.has(line.goodsReceiptLineId)) {
        throw new NotFoundError(
          `Goods receipt line "${line.goodsReceiptLineId}" was not found on goods receipt "${goodsReceipt.id}".`,
          {
            code: 'PURCHASE_RETURN.RECEIPT_LINE_NOT_FOUND',
            params: { lineId: line.goodsReceiptLineId, goodsReceiptId: goodsReceipt.id },
          },
        );
      }
    }

    await this.assertWithinReceived(
      db,
      receiptLines,
      input.lines.map((line) => ({
        goodsReceiptLineId: line.goodsReceiptLineId,
        quantityReturned: line.quantityReturned,
        unitFactor: receiptLineById.get(line.goodsReceiptLineId)!.unitFactor,
      })),
    );

    try {
      return await withTransaction(db, async (trx) => {
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
              unitOfMeasureId: receiptLine.unitOfMeasureId,
              unitFactor: receiptLine.unitFactor,
            }),
          );
        }

        return { ...purchaseReturn, lines: createdLines };
      });
    } catch (err) {
      if (isPostgresForeignKeyViolation(err)) {
        throw new NotFoundError('The given goods receipt or goods receipt line does not exist.', {
          code: 'PURCHASE_RETURN.RECEIPT_OR_LINE_NOT_FOUND',
        });
      }
      if (err instanceof Error && err.message.includes('No numbering sequence configured')) {
        throw new BusinessRuleError(
          'No numbering sequence configured for purchase returns yet. ' +
            'Create one for document type "purchase_return" via Settings → Numbering Sequences first.',
          { code: 'PURCHASE_RETURN.NO_NUMBERING_SEQUENCE' },
        );
      }
      throw err;
    }
  }

  /**
   * The one-way door. Flips the status AND writes the
   * 'purchases.purchase_return.confirmed' integration event to the Outbox
   * in the same transaction (CLAUDE.md §2.7) — mirroring
   * GoodsReceiptsService.confirm(). Before 2026-10 the controller
   * published it on the plain Event Bus after commit, so a crash or a
   * failing stock listener silently left a confirmed return with no stock
   * decrease. Inventory's PurchaseReturnStockListener consumes it (never a
   * direct call — CLAUDE.md §2.6). Returns the goods receipt's warehouseId
   * alongside the confirmed return (see PurchaseReturnConfirmation).
   */
  async confirm(
    db: Kysely<TenantDatabase>,
    id: string,
    schema: string,
    actorUserId: string | null,
  ): Promise<PurchaseReturnConfirmation> {
    const existing = await this.returns.findById(db, id);
    if (!existing) throw entityNotFound('PURCHASE_RETURN', id);
    if (existing.status !== 'draft') {
      throw new BusinessRuleError(
        `Cannot confirm purchase return "${id}" from its current status "${existing.status}" (expected "draft").`,
        { code: 'PURCHASE_RETURN.NOT_CONFIRMABLE', params: { id, status: existing.status } },
      );
    }

    return withTransaction(db, async (trx) => {
      await lockRowsForUpdate(trx, 'purchase_returns', [id]);
      const current = await this.returns.findById(trx, id);
      if (!current || current.status !== 'draft') throw statusChanged('PURCHASE_RETURN', id);
      const lines = await this.lines.listByPurchaseReturnId(trx, id);
      const goodsReceipt = await this.goodsReceipts.findById(trx, existing.goodsReceiptId);
      if (!goodsReceipt) {
        throw entityNotFound('GOODS_RECEIPT', existing.goodsReceiptId);
      }
      // Under a lock on the receipt lines: confirmed returns + this one must
      // stay within what was received — two drafts can't both return the same units.
      const receiptLines = await this.goodsReceiptLines.listByGoodsReceiptId(trx, goodsReceipt.id);
      await lockRowsForUpdate(
        trx,
        'goods_receipt_lines',
        receiptLines.map((line) => line.id),
      );
      await this.assertWithinReceived(
        trx,
        receiptLines,
        lines.map((line) => ({
          goodsReceiptLineId: line.goodsReceiptLineId,
          quantityReturned: line.quantityReturned,
          unitFactor: line.unitFactor,
        })),
      );
      // Expired stock may go back to the supplier, so expiry is not checked here.
      await this.stockChecker.assertAvailable(
        trx,
        goodsReceipt.warehouseId,
        lines.map((line) => ({
          productVariantId: line.productVariantId,
          quantity: Math.round(line.quantityReturned * line.unitFactor * 10_000) / 10_000,
        })),
        { blockExpired: false, errorCode: 'PURCHASE_RETURN.INSUFFICIENT_STOCK' },
      );
      const updated = await this.returns.updateStatus(trx, id, 'confirmed', 'draft');
      if (!updated) throw statusChanged('PURCHASE_RETURN', id);

      // What the supplier now owes back for the invoiced part of the return. Issued first: the
      // rest of each line was never invoiced, and Inventory needs to know how much that is.
      const debitNote = await this.debitNotes.issueForReturn(trx, updated, lines, { schema, actorUserId });
      const tenantCurrency = await this.currencyRates.tenantCurrency(trx);
      const receiptLineById = new Map(receiptLines.map((line) => [line.id, line]));

      await this.outboxWriter.write(trx, 'purchases.purchase_return.confirmed', {
        schema,
        entityType: 'purchase_return',
        entityId: updated.id,
        action: 'confirmed',
        actorUserId,
        metadata: {
          goodsReceiptId: updated.goodsReceiptId,
          warehouseId: goodsReceipt.warehouseId,
          returnNumber: updated.returnNumber,
          returnDate: updated.returnDate,
          lines: lines.map((line) => {
            // Base units for Inventory (line quantity is in the line's own unit).
            const quantity = Math.round(line.quantityReturned * line.unitFactor * 10_000) / 10_000;
            return {
              productVariantId: line.productVariantId,
              quantity,
              ...uninvoicedPart(
                quantity,
                debitNote?.coveredBaseQuantity.get(line.id) ?? 0,
                receiptLineById.get(line.goodsReceiptLineId),
                goodsReceipt.exchangeRate,
                tenantCurrency,
              ),
            };
          }),
        },
        occurredAt: new Date(),
      });

      return { ...updated, lines, warehouseId: goodsReceipt.warehouseId };
    });
  }

  private async transitionStatus(
    db: Kysely<TenantDatabase>,
    id: string,
    from: PurchaseReturnStatus[],
    to: PurchaseReturnStatus,
  ): Promise<PurchaseReturn> {
    const existing = await this.returns.findById(db, id);
    if (!existing) throw entityNotFound('PURCHASE_RETURN', id);
    if (!from.includes(existing.status)) {
      throw new BusinessRuleError(
        `Cannot move purchase return "${id}" to "${to}" from its current status "${existing.status}" ` +
          `(expected one of: ${from.join(', ')}).`,
        {
          code: 'PURCHASE_RETURN.INVALID_STATUS_TRANSITION',
          params: { id, to, from: existing.status, expected: from.join(', ') },
        },
      );
    }
    const updated = await this.returns.updateStatus(db, id, to, from);
    if (!updated) throw statusChanged('PURCHASE_RETURN', id);
    return updated;
  }

  /** Confirmed returns + these lines must stay within each receipt line's received quantity (base units). */
  private async assertWithinReceived(
    db: Kysely<TenantDatabase>,
    receiptLines: GoodsReceiptLine[],
    requested: Array<{ goodsReceiptLineId: string; quantityReturned: number; unitFactor: number }>,
  ): Promise<void> {
    const returned = await this.lines.sumReturnedBaseQuantityByGoodsReceiptLineIds(db, [
      ...new Set(requested.map((line) => line.goodsReceiptLineId)),
    ]);
    const excess = findQuantityExcess(
      requested.map((line) => ({
        sourceLineId: line.goodsReceiptLineId,
        quantity: line.quantityReturned,
        unitFactor: line.unitFactor,
      })),
      new Map(receiptLines.map((line) => [line.id, toBaseQuantity(line.quantityReceived, line.unitFactor)])),
      returned,
    );
    if (!excess) return;
    const factor = receiptLines.find((line) => line.id === excess.sourceLineId)?.unitFactor ?? 1;
    const params = {
      lineId: excess.sourceLineId,
      quantityReturned: inLineUnit(excess.requestedBase, factor),
      remaining: inLineUnit(excess.remainingBase, factor),
      quantityReceived: inLineUnit(excess.limitBase, factor),
      returned: inLineUnit(excess.usedBase, factor),
    };
    throw new BusinessRuleError(
      `Cannot return ${params.quantityReturned} against goods receipt line "${params.lineId}" — ` +
        `only ${params.remaining} remaining returnable (received ${params.quantityReceived}, already returned ${params.returned}).`,
      { code: 'PURCHASE_RETURN.QUANTITY_EXCEEDS_REMAINING', params },
    );
  }

  cancel(db: Kysely<TenantDatabase>, id: string): Promise<PurchaseReturn> {
    return this.transitionStatus(db, id, ['draft'], 'cancelled');
  }

  async delete(db: Kysely<TenantDatabase>, id: string): Promise<void> {
    const existing = await this.returns.findById(db, id);
    if (!existing) throw entityNotFound('PURCHASE_RETURN', id);
    if (existing.status !== 'draft' && existing.status !== 'cancelled') {
      throw new BusinessRuleError(`Purchase return "${id}" is "${existing.status}" and cannot be deleted.`, {
        code: 'PURCHASE_RETURN.NOT_DELETABLE',
        params: { id, status: existing.status },
      });
    }
    await this.returns.delete(db, id);
  }
}

/**
 * Return before invoicing: the part of a returned line no invoice covers
 * left GRNI at the receipt line's frozen value (receipt unit cost × the
 * receipt's rate), not at today's average cost — so the return must take it
 * out of GRNI at that same value (Inventory books the difference against
 * cost of goods sold). Omitted when everything returned was invoiced, or the
 * receipt's value can't be stated in the tenant currency.
 */
export function uninvoicedPart(
  returnedBase: number,
  coveredBase: number,
  receiptLine: GoodsReceiptLine | undefined,
  receiptRate: string | null,
  tenantCurrency: string,
): { uninvoicedBaseQuantity?: number; uninvoicedReceiptValue?: { amountMinorUnits: string; currency: string } } {
  const uninvoiced = Math.round(Math.max(0, returnedBase - coveredBase) * 10_000) / 10_000;
  if (!receiptLine || uninvoiced <= 0) return {};
  const { totalCost } = valueInTenantCurrency(receiptLine, receiptRate, tenantCurrency);
  if (totalCost.currency !== tenantCurrency) return {};
  const receivedBase = Math.round(receiptLine.quantityReceived * receiptLine.unitFactor * 10_000) / 10_000;
  const value = moneyShare(BigInt(totalCost.amountMinorUnits), uninvoiced, receivedBase);
  return { uninvoicedBaseQuantity: uninvoiced, uninvoicedReceiptValue: { amountMinorUnits: value.toString(), currency: tenantCurrency } };
}

/** minorUnits × part / whole, rounded half away from zero (exact BigInt; quantities to 4 places). */
function moneyShare(minorUnits: bigint, part: number, whole: number): bigint {
  const partScaled = BigInt(Math.round(part * 10_000));
  const wholeScaled = BigInt(Math.round(whole * 10_000));
  if (wholeScaled === 0n) return 0n;
  if (partScaled >= wholeScaled) return minorUnits;
  const negative = minorUnits < 0n;
  const abs = negative ? -minorUnits : minorUnits;
  const rounded = (abs * partScaled * 2n + wholeScaled) / (wholeScaled * 2n);
  return negative ? -rounded : rounded;
}

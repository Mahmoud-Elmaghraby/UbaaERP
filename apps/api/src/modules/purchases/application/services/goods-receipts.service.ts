import { Inject, Injectable } from '@nestjs/common';
import { sql, type Kysely } from 'kysely';
import { Money } from '@erp-platform/shared-kernel';
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
import type { PurchaseOrderLine, PurchaseOrderStatus } from '../../domain/purchase-order.entity';
import type {
  GoodsReceipt,
  GoodsReceiptWithLines,
  GoodsReceiptLine,
  GoodsReceiptStatus,
  CreateGoodsReceiptInput,
  ReceiptLot,
} from '../../domain/goods-receipt.entity';
import { PRODUCT_TRACKING_READER, type ProductTrackingReader } from '../ports/product-tracking.reader';
import { BusinessRuleError, NotFoundError, isPostgresForeignKeyViolation } from '../errors';
import { entityNotFound, statusChanged } from '../../../../shared/errors/entity-errors';
import { lockRowsForUpdate } from '../../../../shared/persistence/row-locks';
import { findQuantityExcess, inLineUnit, toBaseQuantity } from './quantity-limits';
import { NumberingSequencesService } from '../../../settings/application/services/numbering-sequences.service';
import { OutboxWriterService } from '../../../../shared/outbox/application/services/outbox-writer.service';
import { CurrencyRateReader, applyRate } from '../../../../shared/catalog/currency-rate-reader';
import type { ReceiptInvoiceDifference } from '../../../../shared/events/purchase-price-difference';
import { computeReceiptInvoiceDifferences, type PostedInvoiceLineForReceipt } from './purchase-price-differences';
import { PurchaseLimitsService } from './purchase-limits.service';

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
    private readonly limits: PurchaseLimitsService,
  ) {}

  /** Plain read helper (no dependencies) — not injected, so callers' wiring is unchanged. */
  private readonly currencyRates = new CurrencyRateReader();

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

    for (const line of input.lines) {
      const poLine = poLineById.get(line.purchaseOrderLineId)!;
      assertSameCurrencyAsOrder(line.unitCost?.currency, poLine.unitPrice.currency);
    }
    await this.assertWithinOrdered(
      db,
      poLines,
      input.lines.map((line) => ({
        purchaseOrderLineId: line.purchaseOrderLineId,
        quantityReceived: line.quantityReceived,
        unitFactor: poLineById.get(line.purchaseOrderLineId)!.unitFactor,
      })),
    );

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
          exchangeRate: input.exchangeRate ?? null,
          notes: input.notes ?? null,
          customFields: input.customFields ?? {},
          sourcePurchaseInvoiceId: input.sourcePurchaseInvoiceId ?? null,
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
              unitOfMeasureId: poLine.unitOfMeasureId,
              unitFactor: poLine.unitFactor,
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
    const updated = await this.receipts.updateStatus(db, id, to, from);
    if (!updated) throw statusChanged('GOODS_RECEIPT', id);
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
      // Re-read under a lock: a concurrent confirm/cancel of this same receipt waits here.
      await lockRowsForUpdate(trx, 'goods_receipts', [id]);
      const current = await this.receipts.findById(trx, id);
      if (!current || current.status !== 'draft') throw statusChanged('GOODS_RECEIPT', id);
      const lines = await this.lines.listByGoodsReceiptId(trx, id);
      // Under a lock on the PO and its lines: the PO must still be receivable
      // (not cancelled meanwhile) and confirmed receipts + this one must stay
      // within the ordered quantity — two drafts can't both receive the same units.
      const poLines = await this.lockReceivableOrder(trx, existing.purchaseOrderId);
      await this.assertWithinOrdered(
        trx,
        poLines,
        lines.map((line) => ({
          purchaseOrderLineId: line.purchaseOrderLineId,
          quantityReceived: line.quantityReceived,
          unitFactor: line.unitFactor,
        })),
      );
      // Stock is valued in the tenant's currency: a foreign-currency
      // receipt is converted at its own (typed or effective) rate, frozen here.
      const tenantCurrency = await this.currencyRates.tenantCurrency(trx);
      const rate = await this.resolveExchangeRate(trx, existing, lines, tenantCurrency);
      if (rate && rate !== existing.exchangeRate) await this.receipts.setExchangeRate(trx, id, rate);
      // Before the status flip (this receipt must not count as "previously received").
      const invoicedDifferences = await this.invoicedDifferencesFor(trx, id, lines, rate, tenantCurrency);

      const updated = await this.receipts.updateStatus(trx, id, 'confirmed', 'draft');
      if (!updated) throw statusChanged('GOODS_RECEIPT', id);

      const po = await this.purchaseOrders.findById(trx, updated.purchaseOrderId);
      if (po) {
        const receivedByLine = await this.lines.sumReceivedBaseQuantityByPurchaseOrderLineIds(
          trx,
          poLines.map((line) => line.id),
        );
        const fullyReceived = poLines.every(
          (line) => (receivedByLine[line.id] ?? 0) >= toBaseQuantity(line.quantity, line.unitFactor) - 1e-6,
        );
        const newPoStatus = fullyReceived ? 'fully_received' : 'partially_received';
        if (po.status !== newPoStatus) {
          const moved = await this.purchaseOrders.updateStatus(trx, po.id, newPoStatus, po.status);
          if (!moved) throw statusChanged('PURCHASE_ORDER', po.id);
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
          receiptNumber: updated.receiptNumber,
          receivedDate: updated.receivedDate,
          lines: lines.map((line) => ({
            productVariantId: line.productVariantId,
            // Inventory works in base units: a line of 2 cartons × 12 at 240/carton → 24 at 20.
            quantity: toBase(line.quantityReceived, line.unitFactor),
            ...valueInTenantCurrency(line, rate, tenantCurrency),
            lots: line.lots.map((lot) => ({ ...lot, quantity: toBase(lot.quantity, line.unitFactor) })),
          })),
          // Goods a posted invoice billed before they arrived: Inventory moves the price part into
          // their cost, Accounting books the exchange part (see computeReceiptInvoiceDifferences).
          invoicedDifferences,
        },
        occurredAt: new Date(),
      });

      return { ...updated, lines };
    });
  }

  /**
   * Locks the purchase order row, refuses unless it can still receive
   * goods, then locks its lines (same order everywhere: document → PO →
   * PO lines) and returns them.
   */
  private async lockReceivableOrder(trx: Kysely<TenantDatabase>, purchaseOrderId: string): Promise<PurchaseOrderLine[]> {
    await lockRowsForUpdate(trx, 'purchase_orders', [purchaseOrderId]);
    const po = await this.purchaseOrders.findById(trx, purchaseOrderId);
    if (!po || !RECEIVABLE_ORDER_STATUSES.includes(po.status)) {
      throw new BusinessRuleError(
        `Purchase order "${purchaseOrderId}" is "${po?.status ?? 'missing'}" — nothing can be received against it.`,
        {
          code: 'GOODS_RECEIPT.PURCHASE_ORDER_NOT_RECEIVABLE',
          params: { id: purchaseOrderId, status: po?.status ?? '' },
        },
      );
    }
    const poLines = await this.purchaseOrderLines.listByPurchaseOrderId(trx, purchaseOrderId);
    await lockRowsForUpdate(
      trx,
      'purchase_order_lines',
      poLines.map((line) => line.id),
    );
    return poLines;
  }

  /** Confirmed receipts + these lines must stay within each PO line's ordered quantity (base units). */
  private async assertWithinOrdered(
    db: Kysely<TenantDatabase>,
    poLines: PurchaseOrderLine[],
    requested: Array<{ purchaseOrderLineId: string; quantityReceived: number; unitFactor: number }>,
  ): Promise<void> {
    const received = await this.lines.sumReceivedBaseQuantityByPurchaseOrderLineIds(db, [
      ...new Set(requested.map((line) => line.purchaseOrderLineId)),
    ]);
    // Receipts / invoices may go past the ordered quantity by 'purchases.overReceiptTolerancePercent'.
    const limit = await this.limits.orderedLimit(db);
    const excess = findQuantityExcess(
      requested.map((line) => ({
        sourceLineId: line.purchaseOrderLineId,
        quantity: line.quantityReceived,
        unitFactor: line.unitFactor,
      })),
      new Map(poLines.map((line) => [line.id, limit(toBaseQuantity(line.quantity, line.unitFactor))])),
      received,
    );
    if (!excess) return;
    const factor = poLines.find((line) => line.id === excess.sourceLineId)?.unitFactor ?? 1;
    const params = {
      lineId: excess.sourceLineId,
      quantityReceived: inLineUnit(excess.requestedBase, factor),
      remaining: inLineUnit(excess.remainingBase, factor),
      ordered: inLineUnit(excess.limitBase, factor),
      received: inLineUnit(excess.usedBase, factor),
    };
    throw new BusinessRuleError(
      `Cannot receive ${params.quantityReceived} against purchase order line "${params.lineId}" — ` +
        `only ${params.remaining} remaining (ordered ${params.ordered}, already received ${params.received}).`,
      { code: 'GOODS_RECEIPT.QUANTITY_EXCEEDS_REMAINING', params },
    );
  }

  /**
   * What the confirmed receipts of a purchase order put into stock, per PO
   * line: base quantity and value in the tenant currency — exactly what
   * Inventory and GRNI were credited with at confirmation (the receipt's
   * frozen rate). A line whose value can't be stated in the tenant currency
   * (an old foreign receipt without a frozen rate) is reported `complete: false`.
   */
  async receivedValueByOrderLine(
    db: Kysely<TenantDatabase>,
    purchaseOrderId: string,
  ): Promise<Map<string, ReceivedOrderLineValue>> {
    const tenantCurrency = await this.currencyRates.tenantCurrency(db);
    const receipts = (await this.receipts.listByPurchaseOrderId(db, purchaseOrderId)).filter(
      (receipt) => receipt.status === 'confirmed',
    );
    const result = new Map<string, ReceivedOrderLineValue>();
    for (const receipt of receipts) {
      for (const line of await this.lines.listByGoodsReceiptId(db, receipt.id)) {
        const entry = result.get(line.purchaseOrderLineId) ?? {
          baseQuantity: 0,
          value: Money.zero(tenantCurrency),
          documentValue: Money.zero(line.unitCost.currency),
          goodsReceiptIds: [],
          complete: true,
        };
        entry.documentValue = entry.documentValue.add(line.unitCost.multiplyByQuantity(line.quantityReceived));
        const { totalCost } = valueInTenantCurrency(line, receipt.exchangeRate, tenantCurrency);
        if (totalCost.currency === tenantCurrency) {
          entry.value = entry.value.add(Money.fromMinorUnits(BigInt(totalCost.amountMinorUnits), tenantCurrency));
        } else {
          entry.complete = false;
        }
        entry.baseQuantity = toBase(entry.baseQuantity + toBase(line.quantityReceived, line.unitFactor), 1);
        if (!entry.goodsReceiptIds.includes(receipt.id)) entry.goodsReceiptIds.push(receipt.id);
        result.set(line.purchaseOrderLineId, entry);
      }
    }
    return result;
  }

  /**
   * Invoice before receipt: for the quantity of these lines that posted
   * invoices already billed (and no earlier receipt covered), the price and
   * exchange parts between the invoice and this receipt. Runs under the PO /
   * PO-line locks confirm() holds, which also serialize invoice posting.
   */
  private async invoicedDifferencesFor(
    trx: Kysely<TenantDatabase>,
    receiptId: string,
    lines: GoodsReceiptLine[],
    rate: string | null,
    tenantCurrency: string,
  ): Promise<ReceiptInvoiceDifference[]> {
    const poLineIds = [...new Set(lines.map((line) => line.purchaseOrderLineId))];
    if (poLineIds.length === 0) return [];
    const rows = await trx
      .selectFrom('purchase_invoice_lines as l')
      .innerJoin('purchase_invoices as i', 'i.id', 'l.purchase_invoice_id')
      .select([
        'l.purchase_order_line_id',
        'l.quantity_invoiced',
        'l.unit_factor',
        'l.unit_price_amount',
        'l.unit_price_currency',
        'l.net_amount',
        'i.id as invoice_id',
        'i.invoice_number',
        'i.invoice_date',
        'i.created_at',
      ])
      .where('i.status', '=', 'posted')
      .where('l.purchase_order_line_id', 'in', poLineIds)
      .orderBy(sql`COALESCE(i.invoice_date, i.created_at::date)`)
      .orderBy('i.created_at')
      .orderBy('l.created_at')
      .execute();
    if (rows.length === 0) return [];

    const previouslyReceived = new Map(
      Object.entries(await this.lines.sumReceivedBaseQuantityByPurchaseOrderLineIds(trx, poLineIds)),
    );
    const invoicedBase = new Map<string, number>();
    for (const row of rows) {
      const base = toBase(Number(row.quantity_invoiced), Number(row.unit_factor));
      invoicedBase.set(row.purchase_order_line_id, (invoicedBase.get(row.purchase_order_line_id) ?? 0) + base);
    }
    // Nothing billed beyond what earlier receipts brought in: an ordinary receipt.
    if (![...invoicedBase].some(([poLineId, base]) => base > (previouslyReceived.get(poLineId) ?? 0) + QUANTITY_EPSILON)) {
      return [];
    }

    const rates = new Map<string, string | null>();
    const invoicedLines: PostedInvoiceLineForReceipt[] = [];
    for (const row of rows) {
      const quantity = Number(row.quantity_invoiced);
      const currency = row.unit_price_currency;
      const netAmount =
        row.net_amount !== null
          ? Money.fromMinorUnits(BigInt(row.net_amount), currency)
          : Money.fromMinorUnits(BigInt(row.unit_price_amount), currency).multiplyByQuantity(quantity);
      const invoiceDate = calendarDate(row.invoice_date ?? row.created_at);
      let invoiceRate: string | null = null;
      if (currency !== tenantCurrency) {
        const key = `${currency}|${invoiceDate}`;
        if (!rates.has(key)) rates.set(key, await this.currencyRates.effectiveRate(trx, currency, tenantCurrency, invoiceDate));
        invoiceRate = rates.get(key) ?? null;
        if (!invoiceRate) {
          throw new BusinessRuleError(
            `No ${currency}→${tenantCurrency} exchange rate on or before ${invoiceDate} (the date of purchase invoice ` +
              `"${row.invoice_number}", which billed these goods before goods receipt "${receiptId}").`,
            { code: 'GOODS_RECEIPT.EXCHANGE_RATE_REQUIRED', params: { currency, date: invoiceDate } },
          );
        }
      }
      invoicedLines.push({
        purchaseOrderLineId: row.purchase_order_line_id,
        purchaseInvoiceId: row.invoice_id,
        invoiceNumber: row.invoice_number,
        invoiceDate,
        baseQuantity: toBase(quantity, Number(row.unit_factor)),
        netAmount,
        rate: invoiceRate,
      });
    }

    return computeReceiptInvoiceDifferences({
      receiptLines: lines.map((line) => {
        const { totalCost } = valueInTenantCurrency(line, rate, tenantCurrency);
        return {
          goodsReceiptId: receiptId,
          purchaseOrderLineId: line.purchaseOrderLineId,
          productVariantId: line.productVariantId,
          baseQuantity: toBase(line.quantityReceived, line.unitFactor),
          documentValue: line.unitCost.multiplyByQuantity(line.quantityReceived),
          ledgerValue: Money.fromMinorUnits(BigInt(totalCost.amountMinorUnits), totalCost.currency),
        };
      }),
      invoicedLines,
      previouslyReceived,
      tenantCurrency,
    });
  }

  /**
   * The rate a foreign-currency receipt is valued at: the one typed on the
   * receipt, else the effective rate on its date (receivedDate, else today).
   * Null when every line is already in the tenant's currency.
   */
  private async resolveExchangeRate(
    trx: Kysely<TenantDatabase>,
    receipt: GoodsReceipt,
    lines: GoodsReceiptLine[],
    tenantCurrency: string,
  ): Promise<string | null> {
    const foreign = [...new Set(lines.map((line) => line.unitCost.currency))].filter(
      (currency) => currency !== tenantCurrency,
    );
    if (foreign.length === 0) return null;
    if (foreign.length > 1) {
      throw new BusinessRuleError(`Goods receipt "${receipt.id}" mixes currencies ${foreign.join(', ')}.`, {
        code: 'GOODS_RECEIPT.MIXED_CURRENCIES',
        params: { currencies: foreign.join('، ') },
      });
    }
    const date = calendarDate(receipt.receivedDate ?? new Date());
    const rate =
      receipt.exchangeRate ?? (await this.currencyRates.effectiveRate(trx, foreign[0], tenantCurrency, date));
    if (!rate) {
      throw new BusinessRuleError(
        `No ${foreign[0]}→${tenantCurrency} exchange rate on or before ${date} for goods receipt "${receipt.id}".`,
        { code: 'GOODS_RECEIPT.EXCHANGE_RATE_REQUIRED', params: { currency: foreign[0], date } },
      );
    }
    return rate;
  }

  /** Receipts a purchase invoice made for itself (direct invoicing, migration 0103). */
  listMadeByInvoice(db: Kysely<TenantDatabase>, purchaseInvoiceId: string): Promise<GoodsReceipt[]> {
    return this.receipts.listBySourcePurchaseInvoiceId(db, purchaseInvoiceId);
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

/** A purchase order goods can still be received against. */
export const RECEIVABLE_ORDER_STATUSES: readonly PurchaseOrderStatus[] = ['confirmed', 'partially_received'];

/**
 * A receipt cost / invoice price must be in the purchase order's own
 * currency (one PO, one currency): a USD cost on an EGP order would be
 * valued as if it were EGP.
 */
export function assertSameCurrencyAsOrder(currency: string | undefined, orderCurrency: string): void {
  if (currency === undefined || currency === orderCurrency) return;
  throw new BusinessRuleError(
    `The amount is in ${currency}, but the purchase order is in ${orderCurrency} — use the order's currency.`,
    { code: 'PURCHASE.CURRENCY_MISMATCH', params: { currency, orderCurrency } },
  );
}

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

type MoneyJson = { amountMinorUnits: string; currency: string };

/** See GoodsReceiptsService.receivedValueByOrderLine(). */
export interface ReceivedOrderLineValue {
  baseQuantity: number;
  /** Tenant currency, at each receipt's frozen rate. */
  value: Money;
  /** The same goods in the document (order) currency: quantity × unit cost. */
  documentValue: Money;
  goodsReceiptIds: string[];
  complete: boolean;
}

/**
 * A receipt line's cost for Inventory, in base units and the tenant's
 * currency: unitCost per base unit (display/fallback) and totalCost — the
 * exact line value (quantity × unit cost, converted once) that the stock
 * value grows by, so no rounding is lost per unit.
 */
export function valueInTenantCurrency(
  line: GoodsReceiptLine,
  rate: string | null,
  tenantCurrency: string,
): { unitCost: MoneyJson; totalCost: MoneyJson } {
  const lineTotal = line.unitCost.multiplyByQuantity(line.quantityReceived);
  const total =
    line.unitCost.currency === tenantCurrency || !rate
      ? lineTotal
      : Money.fromMinorUnits(applyRate(lineTotal.toMinorUnits(), rate), tenantCurrency);
  const baseQuantity = toBase(line.quantityReceived, line.unitFactor);
  const perBase = baseQuantity > 0 ? total.divideByQuantity(baseQuantity) : total;
  return {
    unitCost: { amountMinorUnits: perBase.toMinorUnits().toString(), currency: perBase.currency },
    totalCost: { amountMinorUnits: total.toMinorUnits().toString(), currency: total.currency },
  };
}

/**
 * YYYY-MM-DD of a DATE column value or a moment. pg hands DATE columns back
 * as a Date at local midnight (despite the string type), so local parts.
 */
function calendarDate(value: string | Date): string {
  if (typeof value === 'string') return value.slice(0, 10);
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
}

function toBase(quantity: number, unitFactor: number): number {
  return Math.round(quantity * unitFactor * 10_000) / 10_000;
}

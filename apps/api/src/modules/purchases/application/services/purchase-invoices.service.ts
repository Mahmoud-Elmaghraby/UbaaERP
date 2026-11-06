import { Inject, Injectable } from '@nestjs/common';
import { sql, type Kysely } from 'kysely';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import { computeDocumentTaxes, toSnapshot, totalsToDto } from '../../../../shared/taxes/document-taxes';
import { withTransaction } from '../../../../database/tenant/transaction.util';
import type { CreateGoodsReceiptInput, ReceiptLot } from '../../domain/goods-receipt.entity';
import {
  PURCHASE_INVOICE_REPOSITORY,
  type PurchaseInvoiceRepository,
} from '../ports/purchase-invoice.repository';
import {
  PURCHASE_INVOICE_LINE_REPOSITORY,
  type PurchaseInvoiceLineRepository,
} from '../ports/purchase-invoice-line.repository';
import { PURCHASE_ORDER_REPOSITORY, type PurchaseOrderRepository } from '../ports/purchase-order.repository';
import {
  PURCHASE_ORDER_LINE_REPOSITORY,
  type PurchaseOrderLineRepository,
} from '../ports/purchase-order-line.repository';
import { GOODS_RECEIPT_LINE_REPOSITORY, type GoodsReceiptLineRepository } from '../ports/goods-receipt-line.repository';
import { Money } from '@erp-platform/shared-kernel';
import {
  assertSingleCurrency,
  calculatePurchaseInvoiceTotals,
  type PurchaseInvoice,
  type PurchaseInvoiceLine,
  type PurchaseInvoiceWithLines,
  type CreatePurchaseInvoiceInput,
} from '../../domain/purchase-invoice.entity';
import type { PurchaseOrderLine, PurchaseOrderStatus } from '../../domain/purchase-order.entity';
import { BusinessRuleError, ConflictError, NotFoundError, isPostgresForeignKeyViolation } from '../errors';
import { entityNotFound, statusChanged } from '../../../../shared/errors/entity-errors';
import { lockRowsForUpdate } from '../../../../shared/persistence/row-locks';
import { NumberingSequencesService } from '../../../settings/application/services/numbering-sequences.service';
import { TenantSettingsService } from '../../../settings/application/services/tenant-settings.service';
import { OutboxWriterService } from '../../../../shared/outbox/application/services/outbox-writer.service';
import { FeatureAvailabilityService } from '../../../../shared/plans/feature-availability.service';
import { FEATURE_KEYS } from '../../../../shared/plans/feature-catalog';
import { assertCurrencyAllowedForTenant } from '../../../../shared/plans/currency-gate';
import { PurchaseOrdersService } from './purchase-orders.service';
import { GoodsReceiptsService, assertSameCurrencyAsOrder } from './goods-receipts.service';
import { findQuantityExcess, inLineUnit, toBaseQuantity } from './quantity-limits';
import { computePurchasePriceDifferences } from './purchase-price-differences';
import { CurrencyRateReader, applyRate } from '../../../../shared/catalog/currency-rate-reader';
import type { PurchasePriceDifference } from '../../../../shared/events/purchase-price-difference';
import { localIsoDate } from '../../../../shared/time/local-date';

/**
 * Purchase Invoices (master doc §10, step 3 — Purchases, Stage 7). This
 * module's first genuinely financial document — posting one (not
 * creating it — see post()) writes to the Outbox Pattern (CLAUDE.md
 * §2.7), not just the plain Event Bus every earlier Purchases stage uses.
 *
 * Same two-step shape as every prior document: create() persists a
 * 'draft' invoice, already validated against how much of the referenced
 * purchase order lines can still be invoiced (partial billing across
 * multiple invoices against one PO, independent of receipt status — same
 * choice Sales Invoices made against Deliveries). post() is the one-way
 * door — and unlike every prior stage's confirm/select action, publishing
 * its integration event is NOT the controller's job: it happens inside
 * post()'s own transaction, via OutboxWriterService, because Outbox
 * correctness requires the outbox record and the status-flip write to be
 * atomic (CLAUDE.md §2.7). Every other document's controller still
 * publishes after the transaction commits, via PurchasesEventPublisher —
 * that's fine for non-financial events (an accepted trade-off, see Stage
 * 5/6's write-ups), but would defeat the entire point of Outbox here.
 *
 * post() therefore needs `schema` and `actorUserId` as real parameters —
 * every other service method in this module only takes `db` plus domain
 * input, because only the controller layer has request context. create()
 * now needs them too — see "Invoice-takeover orchestrator" below.
 *
 * ## Invoice-takeover orchestrator (claude/platform-flexibility-strategy.md)
 *
 * Direct mirror of SalesInvoicesService's own orchestrator (see that
 * class's comment for the full reasoning) — built second, once the Sales
 * side was verified working. Purchase Orders and Goods Receipts are each
 * independently toggleable (Layer 1 Plan ceiling + Layer 2 tenant
 * self-service), but create() has always had a hard technical dependency
 * on an existing, confirmed Purchase Order (its FK), and Goods Receipt
 * confirmation is where stock actually increases (Inventory's
 * GoodsReceiptStockListener, never Invoice posting). So a tenant that
 * disables Purchase Orders and/or Goods Receipts would otherwise have no
 * way to invoice at all, or would silently skip the stock increase.
 * create() now closes both gaps, using the exact same proven pattern
 * PosSalesService.checkout() / SalesInvoicesService.create() already
 * ship: create the disabled step(s) automatically and invisibly, inside
 * the SAME transaction as the invoice, reusing PurchaseOrdersService/
 * GoodsReceiptsService's own create()/confirm() methods — no shortcut
 * logic duplicated here.
 *
 * Two independent checks, each only when the caller needs that step:
 * - No purchaseOrderId given (the "direct" path — supplierId +
 *   directLines instead): allowed only when PURCHASES_PURCHASE_ORDERS is
 *   NOT effectively enabled for the tenant (FeatureAvailabilityService).
 *   If it IS enabled, this is rejected — a tenant that keeps Purchase
 *   Orders on has chosen to require a real one for every purchase.
 * - Whichever Purchase Order ends up resolved (given, or just
 *   auto-created): if PURCHASES_GOODS_RECEIPTS is NOT effectively
 *   enabled, a matching Goods Receipt is auto-created+confirmed covering
 *   exactly the quantities THIS invoice is billing (not the whole PO —
 *   correct for partial invoicing over multiple calls against one PO)
 *   before the invoice itself is written, guarded by already-received
 *   quantity per line (mirrors SalesInvoicesService's already-delivered
 *   guard — there's no POS-equivalent unconditional creator in Purchases
 *   today, but the guard costs nothing and protects against any
 *   pre-existing receipts on the PO regardless).
 *
 * Outbox symmetry with the Sales side (claude/next-steps-backlog.md item
 * 2, closed): DeliveriesService.confirm() writes 'sales.delivery.confirmed'
 * to the Outbox itself (needed for COGS auto-posting), so
 * SalesInvoicesService.create() gets that event for free just by calling
 * it. GoodsReceiptsService.confirm() now does the exact same thing —
 * calling goodsReceipts.confirm(trx, ..., schema, actorUserId) here folds
 * its Outbox write into this method's own transaction (withTransaction
 * reuses the already-open `trx` rather than nesting), so the auto-created
 * receipt's event is guaranteed to reach Inventory's
 * GoodsReceiptStockListener whenever — and only when — the invoice itself
 * actually commits. No separate publish() call is needed here any more;
 * this used to replicate GoodsReceiptsController's post-commit publish()
 * manually (see git history), which was the one asymmetry left between
 * this orchestrator and its Sales sibling.
 */
@Injectable()
export class PurchaseInvoicesService {
  constructor(
    @Inject(PURCHASE_INVOICE_REPOSITORY) private readonly invoices: PurchaseInvoiceRepository,
    @Inject(PURCHASE_INVOICE_LINE_REPOSITORY) private readonly lines: PurchaseInvoiceLineRepository,
    @Inject(PURCHASE_ORDER_REPOSITORY) private readonly purchaseOrderRepo: PurchaseOrderRepository,
    @Inject(PURCHASE_ORDER_LINE_REPOSITORY) private readonly purchaseOrderLines: PurchaseOrderLineRepository,
    @Inject(GOODS_RECEIPT_LINE_REPOSITORY) private readonly goodsReceiptLines: GoodsReceiptLineRepository,
    private readonly numberingSequences: NumberingSequencesService,
    private readonly tenantSettings: TenantSettingsService,
    private readonly outboxWriter: OutboxWriterService,
    private readonly featureAvailability: FeatureAvailabilityService,
    private readonly purchaseOrdersService: PurchaseOrdersService,
    private readonly goodsReceiptsService: GoodsReceiptsService,
  ) {}

  private readonly currencyRates = new CurrencyRateReader();

  list(db: Kysely<TenantDatabase>): Promise<PurchaseInvoice[]> {
    return this.invoices.list(db);
  }

  listByPurchaseOrderId(db: Kysely<TenantDatabase>, purchaseOrderId: string): Promise<PurchaseInvoice[]> {
    return this.invoices.listByPurchaseOrderId(db, purchaseOrderId);
  }

  async getById(db: Kysely<TenantDatabase>, id: string): Promise<PurchaseInvoiceWithLines> {
    const invoice = await this.invoices.findById(db, id);
    if (!invoice) throw entityNotFound('PURCHASE_INVOICE', id);
    const lines = await this.lines.listByPurchaseInvoiceId(db, id);
    return { ...invoice, lines, ...calculatePurchaseInvoiceTotals(lines) };
  }

  async create(
    db: Kysely<TenantDatabase>,
    input: CreatePurchaseInvoiceInput,
    schema: string,
  ): Promise<PurchaseInvoiceWithLines> {
    const usingDirectPath = input.purchaseOrderId === undefined;
    if (usingDirectPath) {
      if (!input.supplierId || !input.directLines || input.directLines.length === 0) {
        throw new BusinessRuleError(
          'Provide a purchaseOrderId, or a supplierId with at least one directLines entry, to create a purchase invoice.',
          { code: 'PURCHASE_INVOICE.MISSING_DIRECT_SOURCE' },
        );
      }
    } else {
      if (input.supplierId || input.directLines) {
        throw new BusinessRuleError(
          'Provide either purchaseOrderId + lines, or supplierId + directLines — not both.',
          { code: 'PURCHASE_INVOICE.AMBIGUOUS_SOURCE' },
        );
      }
      if (!input.lines || input.lines.length === 0) {
        throw new BusinessRuleError('A purchase invoice must have at least one line.', {
          code: 'PURCHASE_INVOICE.AT_LEAST_ONE_LINE_REQUIRED',
        });
      }
    }

    interface ResolvedInvoiceLine {
      purchaseOrderLineId: string;
      quantityInvoiced: number;
      unitPrice: Money;
      taxRuleIds?: string[];
      notes: string | null | undefined;
    }

    let result: PurchaseInvoiceWithLines;
    try {
      result = await withTransaction(db, async (trx) => {
        let poId: string;
        let supplierId: string;
        let poLines: PurchaseOrderLine[];
        let resolvedLines: ResolvedInvoiceLine[];
        // Lots/serials typed on the invoice, used only when the invoice also
        // receives the goods (Goods Receipts disabled).
        const lotsByPoLineId = new Map<string, ReceiptLot[]>();

        if (usingDirectPath) {
          const purchaseOrdersEnabled = await this.featureAvailability.isEnabled(
            trx,
            schema,
            FEATURE_KEYS.PURCHASES_PURCHASE_ORDERS,
          );
          if (purchaseOrdersEnabled) {
            throw new BusinessRuleError(
              'Purchase Orders is enabled for this tenant — create a purchase order first, then invoice it.',
              { code: 'PURCHASE_INVOICE.PURCHASE_ORDERS_REQUIRED' },
            );
          }

          const order = await this.purchaseOrdersService.create(
            trx,
            {
              supplierId: input.supplierId!,
              lines: input.directLines!.map((line) => ({
                productVariantId: line.productVariantId,
                quantity: line.quantityInvoiced,
                unitPrice: line.unitPrice,
                notes: line.notes ?? null,
                unitOfMeasureId: line.unitOfMeasureId ?? null,
              })),
              customFields: {},
            },
            schema,
          );
          await this.purchaseOrdersService.confirm(trx, order.id);

          poId = order.id;
          supplierId = order.supplierId;
          poLines = order.lines;
          // PurchaseOrdersService.create keeps input order, so line i ↔ directLines[i].
          order.lines.forEach((line, index) => {
            const lots = input.directLines![index]?.lots;
            if (lots?.length) lotsByPoLineId.set(line.id, lots);
          });
          resolvedLines = order.lines.map((line, index) => ({
            purchaseOrderLineId: line.id,
            quantityInvoiced: line.quantity,
            unitPrice: line.unitPrice,
            taxRuleIds: input.directLines![index]?.taxRuleIds,
            notes: undefined,
          }));
        } else {
          const po = await this.purchaseOrderRepo.findById(trx, input.purchaseOrderId!);
          if (!po) throw entityNotFound('PURCHASE_ORDER', input.purchaseOrderId);
          if (!INVOICEABLE_ORDER_STATUSES.includes(po.status)) {
            throw new BusinessRuleError(
              `Purchase order "${input.purchaseOrderId}" is "${po.status}" — only a confirmed purchase order can be invoiced.`,
              {
                code: 'PURCHASE_INVOICE.PURCHASE_ORDER_NOT_INVOICEABLE',
                params: { id: input.purchaseOrderId ?? '', status: po.status },
              },
            );
          }

          poId = po.id;
          supplierId = po.supplierId;
          poLines = await this.purchaseOrderLines.listByPurchaseOrderId(trx, po.id);
          const poLineById = new Map(poLines.map((line) => [line.id, line]));
          for (const line of input.lines!) {
            if (!poLineById.has(line.purchaseOrderLineId)) {
              throw new NotFoundError(
                `Purchase order line "${line.purchaseOrderLineId}" was not found on purchase order "${po.id}".`,
                {
                  code: 'PURCHASE_INVOICE.PURCHASE_ORDER_LINE_NOT_FOUND',
                  params: { lineId: line.purchaseOrderLineId, purchaseOrderId: po.id },
                },
              );
            }
          }

          for (const line of input.lines!) {
            assertSameCurrencyAsOrder(line.unitPrice?.currency, poLineById.get(line.purchaseOrderLineId)!.unitPrice.currency);
          }
          await this.assertWithinOrdered(
            trx,
            poLines,
            input.lines!.map((line) => ({
              purchaseOrderLineId: line.purchaseOrderLineId,
              quantityInvoiced: line.quantityInvoiced,
              unitFactor: poLineById.get(line.purchaseOrderLineId)!.unitFactor,
            })),
          );

          for (const line of input.lines!) {
            if (line.lots?.length) lotsByPoLineId.set(line.purchaseOrderLineId, line.lots);
          }
          resolvedLines = input.lines!.map((line) => ({
            purchaseOrderLineId: line.purchaseOrderLineId,
            quantityInvoiced: line.quantityInvoiced,
            unitPrice: line.unitPrice ?? poLineById.get(line.purchaseOrderLineId)!.unitPrice,
            taxRuleIds: line.taxRuleIds,
            notes: line.notes,
          }));
        }

        try {
          assertSingleCurrency(resolvedLines);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          throw new BusinessRuleError(message, {
            code: 'PURCHASE_INVOICE.MULTIPLE_CURRENCIES',
            params: { reason: message },
          });
        }

        // Multi-currency gate (claude/multi-currency-strategy.md §9) — see
        // SalesInvoicesService.create()'s identical comment for why this is
        // re-checked here even though the source PO already passed it.
        const invoiceCurrency = resolvedLines[0]!.unitPrice.currency;
        const tenantCurrency = (await this.tenantSettings.get(trx)).currencyCode;
        const multiCurrencyEnabled = await this.featureAvailability.isEnabled(
          trx,
          schema,
          FEATURE_KEYS.MULTI_CURRENCY,
        );
        try {
          assertCurrencyAllowedForTenant(invoiceCurrency, tenantCurrency, multiCurrencyEnabled);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          throw new BusinessRuleError(message, {
            code: 'PURCHASE_INVOICE.MULTI_CURRENCY_DISABLED',
            params: { currency: invoiceCurrency, tenantCurrency },
          });
        }

        // Taxes first: an auto-received line enters stock at its net cost (below).
        const poLineById = new Map(poLines.map((line) => [line.id, line]));

        const pricesIncludeTax = input.pricesIncludeTax ?? false;
        const supplier = await trx
          .selectFrom('suppliers')
          .select('withholding_tax_rule_id')
          .where('id', '=', supplierId)
          .executeTakeFirst();
        const lineTaxes = await computeDocumentTaxes(trx, {
          scope: 'purchases',
          partyWithholdingRuleId: supplier?.withholding_tax_rule_id ?? null,
          pricesIncludeTax,
          lines: resolvedLines.map((line) => ({
            productVariantId: poLineById.get(line.purchaseOrderLineId)!.productVariantId,
            amountMinor: line.unitPrice.multiplyByQuantity(line.quantityInvoiced).toMinorUnits(),
            taxRuleIds: line.taxRuleIds,
          })),
        });

        let autoReceipt: CreateGoodsReceiptInput | null = null;
        const goodsReceiptsEnabled = await this.featureAvailability.isEnabled(
          trx,
          schema,
          FEATURE_KEYS.PURCHASES_GOODS_RECEIPTS,
        );
        if (!goodsReceiptsEnabled) {
          // Guard against double-receiving: the direct-invoicing path's
          // freshly-created PO is always unreceived, but the existing-
          // purchaseOrderId path can be handed a PO that was ALREADY fully
          // (or partially) received by something else not gated by this
          // toggle. Only the portion of each line not yet covered by an
          // existing confirmed receipt gets auto-received here.
          const alreadyReceived = await this.goodsReceiptLines.sumReceivedBaseQuantityByPurchaseOrderLineIds(
            trx,
            resolvedLines.map((line) => line.purchaseOrderLineId),
          );
          const linesToReceive = resolvedLines
            .map((line) => {
              const poLine = poLineById.get(line.purchaseOrderLineId)!;
              // Received sums are in base units; the receipt line is in the order line's unit.
              const receivedBase = alreadyReceived[line.purchaseOrderLineId] ?? 0;
              const remaining = Math.max(
                0,
                inLineUnit(toBaseQuantity(poLine.quantity, poLine.unitFactor) - receivedBase, poLine.unitFactor),
              );
              return {
                purchaseOrderLineId: line.purchaseOrderLineId,
                quantityReceived: Math.min(line.quantityInvoiced, remaining),
              };
            })
            .filter((line) => line.quantityReceived > 0);

          const netUnitCostByPoLineId = new Map(
            resolvedLines.map((line, index) => [
              line.purchaseOrderLineId,
              Money.fromMinorUnits(lineTaxes[index]!.net, line.unitPrice.currency).divideByQuantity(line.quantityInvoiced),
            ]),
          );
          if (linesToReceive.length > 0) {
            if (!input.warehouseId) {
              throw new BusinessRuleError(
                'Goods Receipts is disabled for this tenant, so this invoice must record the stock movement a ' +
                  'Goods Receipt normally would — provide a warehouseId.',
                { code: 'PURCHASE_INVOICE.WAREHOUSE_REQUIRED' },
              );
            }
            // Made after the invoice (it points at it), as a draft: see autoReceipt below.
            autoReceipt = {
              purchaseOrderId: poId,
              warehouseId: input.warehouseId,
              // Same date and net-of-tax cost as the invoice, so stock and GRNI
              // carry the invoice's own value (a tax-inclusive price used to
              // put the VAT into the stock value).
              receivedDate: input.invoiceDate ?? null,
              lines: linesToReceive.map((line) => ({
                ...line,
                unitCost: netUnitCostByPoLineId.get(line.purchaseOrderLineId),
                notes: null,
                lots: lotsByPoLineId.get(line.purchaseOrderLineId),
              })),
              customFields: {},
            };
          }
        }

        await this.assertSupplierNumberUnused(trx, supplierId, input.supplierInvoiceNumber);

        const allocated = await this.numberingSequences.allocateNext(trx, 'purchase_invoice', null);

        const invoice = await this.invoices.create(trx, {
          invoiceNumber: allocated.formatted,
          supplierInvoiceNumber: input.supplierInvoiceNumber ?? null,
          purchaseOrderId: poId,
          invoiceDate: input.invoiceDate ?? null,
          dueDate: input.dueDate ?? null,
          notes: input.notes ?? null,
          customFields: input.customFields ?? {},
          pricesIncludeTax,
        });

        // Direct invoicing: the order exists only for this invoice — it goes with it (cancel()/delete()).
        if (usingDirectPath) await this.purchaseOrderRepo.setSourcePurchaseInvoiceId(trx, poId, invoice.id);

        const createdLines = [];
        for (const [index, line] of resolvedLines.entries()) {
          const poLine = poLineById.get(line.purchaseOrderLineId)!;
          const taxes = lineTaxes[index]!;
          createdLines.push(
            await this.lines.create(trx, invoice.id, {
              purchaseOrderLineId: line.purchaseOrderLineId,
              productVariantId: poLine.productVariantId,
              quantityInvoiced: line.quantityInvoiced,
              unitPrice: line.unitPrice,
              netAmount: Money.fromMinorUnits(taxes.net, line.unitPrice.currency),
              taxes: toSnapshot(taxes.taxes),
              notes: line.notes ?? null,
              unitOfMeasureId: poLine.unitOfMeasureId,
              unitFactor: poLine.unitFactor,
            }),
          );
        }

        // Direct invoicing: the invoice's own receipt, still a DRAFT — stock
        // moves when the invoice is posted (post()), never for a draft that
        // ends up cancelled or deleted.
        if (autoReceipt) {
          await this.goodsReceiptsService.create(trx, { ...autoReceipt, sourcePurchaseInvoiceId: invoice.id });
        }

        return { ...invoice, lines: createdLines, ...calculatePurchaseInvoiceTotals(createdLines) };
      });
    } catch (err) {
      if (isPostgresForeignKeyViolation(err)) {
        throw new NotFoundError(
          'The given purchase order, purchase order line, supplier, or warehouse does not exist.',
          { code: 'PURCHASE_INVOICE.SOURCE_NOT_FOUND' },
        );
      }
      if (err instanceof Error && err.message.includes('No numbering sequence configured')) {
        throw new BusinessRuleError(
          'No numbering sequence configured for purchase invoices yet. ' +
            'Create one for document type "purchase_invoice" via Settings → Numbering Sequences first.',
          { code: 'PURCHASE_INVOICE.NO_NUMBERING_SEQUENCE' },
        );
      }
      throw err;
    }

    return result;
  }

  /**
   * The one-way door, and the reason this whole module now has an
   * Outbox. In one DB transaction: flips the invoice to 'posted', then
   * writes the outbox record for 'purchases.purchase_invoice.posted' —
   * atomically, via OutboxWriterService, using the SAME `trx`. Nothing
   * is published on the plain Event Bus here; OutboxDispatcherService
   * (shared/outbox/) picks the row up on its own schedule and does that,
   * with real retry semantics Accounting can eventually depend on.
   */
  async post(
    db: Kysely<TenantDatabase>,
    id: string,
    schema: string,
    actorUserId: string | null,
  ): Promise<PurchaseInvoiceWithLines> {
    const existing = await this.invoices.findById(db, id);
    if (!existing) throw entityNotFound('PURCHASE_INVOICE', id);
    if (existing.status !== 'draft') {
      throw new BusinessRuleError(
        `Cannot post purchase invoice "${id}" from its current status "${existing.status}" (expected "draft").`,
        { code: 'PURCHASE_INVOICE.NOT_POSTABLE', params: { id, status: existing.status } },
      );
    }

    const lines = await this.lines.listByPurchaseInvoiceId(db, id);
    if (lines.length === 0) {
      throw new BusinessRuleError(`Purchase invoice "${id}" has no lines and cannot be posted.`, {
        code: 'PURCHASE_INVOICE.NO_LINES',
        params: { id },
      });
    }
    const totals = calculatePurchaseInvoiceTotals(lines);

    return withTransaction(db, async (trx) => {
      // Re-read under a lock: a concurrent post/cancel of this same invoice waits here.
      await lockRowsForUpdate(trx, 'purchase_invoices', [id]);
      const current = await this.invoices.findById(trx, id);
      if (!current || current.status !== 'draft') throw statusChanged('PURCHASE_INVOICE', id);
      // Direct invoicing: the goods enter stock now, with the invoice. First,
      // so the lock order stays document → PO → PO lines (as in a plain receipt confirm).
      for (const receipt of await this.goodsReceiptsService.listMadeByInvoice(trx, id)) {
        if (receipt.status === 'draft') await this.goodsReceiptsService.confirm(trx, receipt.id, schema, actorUserId);
      }
      // Under a lock on the PO and its lines: the PO must still be invoiceable
      // (not cancelled meanwhile) and posted invoices + this one must stay
      // within the ordered quantity — two drafts can't both bill the same units.
      const poLines = await this.lockInvoiceableOrder(trx, current.purchaseOrderId);
      await this.assertWithinOrdered(
        trx,
        poLines,
        lines.map((line) => ({
          purchaseOrderLineId: line.purchaseOrderLineId,
          quantityInvoiced: line.quantityInvoiced,
          unitFactor: line.unitFactor,
        })),
      );
      const updated = await this.invoices.updateStatus(trx, id, 'posted', 'draft');
      if (!updated) throw statusChanged('PURCHASE_INVOICE', id);
      if (!updated.invoiceDate) {
        // The ledger, statements and exchange differences all date the invoice by this.
        const today = localIsoDate();
        await trx.updateTable('purchase_invoices').set({ invoice_date: today }).where('id', '=', id).execute();
        updated.invoiceDate = today;
      }
      const { tenantCurrency, rate } = await this.invoiceRate(trx, updated, lines);
      const priceDifferences = await this.priceDifferencesFor(trx, updated, lines, tenantCurrency, rate);
      const toLedger = (minor: bigint) => (rate ? applyRate(minor, rate) : minor);

      await this.outboxWriter.write(trx, 'purchases.purchase_invoice.posted', {
        schema,
        entityType: 'purchase_invoice',
        entityId: id,
        action: 'posted',
        actorUserId,
        metadata: {
          purchaseOrderId: updated.purchaseOrderId,
          supplierInvoiceNumber: updated.supplierInvoiceNumber,
          invoiceNumber: updated.invoiceNumber,
          invoiceDate: updated.invoiceDate,
          // net / table tax / VAT / withholding / total — Accounting splits GRNI, expense and taxes on these.
          ...totalsToDto(totals),
          lines: lines.map((line) => ({
            productVariantId: line.productVariantId,
            quantity: line.quantityInvoiced,
            unitPrice: { amountMinorUnits: line.unitPrice.toMinorUnits().toString(), currency: line.unitPrice.currency },
            netAmount: { amountMinorUnits: line.netAmount.toMinorUnits().toString(), currency: line.netAmount.currency },
            // The line's net at the invoice rate, converted per line: Accounting debits GRNI with the
            // sum of these (less exchange differences), so receipts and invoices clear it exactly.
            ledgerNetAmount: { amountMinorUnits: toLedger(line.netAmount.toMinorUnits()).toString(), currency: tenantCurrency },
            taxes: line.taxes,
          })),
          exchangeRate: rate,
          // Inventory corrects the goods' cost by the price parts (`amount`); Accounting books the exchange parts.
          priceDifferences,
        },
        occurredAt: new Date(),
      });

      return { ...updated, lines, ...totals };
    });
  }

  /**
   * The invoice-date rate (null for a tenant-currency invoice). A foreign
   * invoice can't be posted without one: its payable, GRNI clearing and
   * price / exchange differences all need it — skipping them would leave a
   * permanent GRNI balance.
   */
  private async invoiceRate(
    trx: Kysely<TenantDatabase>,
    invoice: PurchaseInvoice,
    lines: PurchaseInvoiceLine[],
  ): Promise<{ tenantCurrency: string; rate: string | null }> {
    const tenantCurrency = await this.currencyRates.tenantCurrency(trx);
    const currency = lines[0].netAmount.currency;
    if (currency === tenantCurrency) return { tenantCurrency, rate: null };
    const date = invoice.invoiceDate ?? localIsoDate();
    const rate = await this.currencyRates.effectiveRate(trx, currency, tenantCurrency, date);
    if (!rate) {
      throw new BusinessRuleError(
        `No ${currency}→${tenantCurrency} exchange rate on or before ${date} — purchase invoice "${invoice.id}" cannot be posted.`,
        { code: 'PURCHASE_INVOICE.EXCHANGE_RATE_MISSING', params: { currency, tenantCurrency, date } },
      );
    }
    return { tenantCurrency, rate };
  }

  /** See computePurchasePriceDifferences(): received goods whose invoice price / rate differs from the receipt's. */
  private async priceDifferencesFor(
    trx: Kysely<TenantDatabase>,
    invoice: PurchaseInvoice,
    lines: PurchaseInvoiceLine[],
    tenantCurrency: string,
    rate: string | null,
  ): Promise<PurchasePriceDifference[]> {
    const received = await this.goodsReceiptsService.receivedValueByOrderLine(trx, invoice.purchaseOrderId);
    if (received.size === 0) return [];

    const poLineIds = [...new Set(lines.map((line) => line.purchaseOrderLineId))];
    const earlier = await trx
      .selectFrom('purchase_invoice_lines as l')
      .innerJoin('purchase_invoices as i', 'i.id', 'l.purchase_invoice_id')
      .select(['l.purchase_order_line_id', 'l.quantity_invoiced', 'l.unit_factor'])
      .where('i.status', '=', 'posted')
      .where('i.id', '!=', invoice.id)
      .where('l.purchase_order_line_id', 'in', poLineIds)
      .execute();
    const previouslyInvoiced = new Map<string, number>();
    for (const row of earlier) {
      const base = Number(row.quantity_invoiced) * Number(row.unit_factor);
      previouslyInvoiced.set(row.purchase_order_line_id, (previouslyInvoiced.get(row.purchase_order_line_id) ?? 0) + base);
    }

    return computePurchasePriceDifferences({
      lines: lines.map((line) => ({
        purchaseOrderLineId: line.purchaseOrderLineId,
        productVariantId: line.productVariantId,
        baseQuantity: Math.round(line.quantityInvoiced * line.unitFactor * 10_000) / 10_000,
        netAmount: line.netAmount,
      })),
      received,
      previouslyInvoiced,
      tenantCurrency,
      rate,
    });
  }

  async cancel(db: Kysely<TenantDatabase>, id: string): Promise<PurchaseInvoice> {
    const existing = await this.invoices.findById(db, id);
    if (!existing) throw entityNotFound('PURCHASE_INVOICE', id);
    if (existing.status !== 'draft') {
      throw new BusinessRuleError(
        `Cannot cancel purchase invoice "${id}" from its current status "${existing.status}" (expected "draft") — ` +
          'a posted invoice is a ledger-worthy fact; reversing one needs a real accounting reversal, not a plain cancel.',
        { code: 'PURCHASE_INVOICE.NOT_CANCELLABLE', params: { id, status: existing.status } },
      );
    }
    return withTransaction(db, async (trx) => {
      const updated = await this.invoices.updateStatus(trx, id, 'cancelled', 'draft');
      if (!updated) throw statusChanged('PURCHASE_INVOICE', id);
      await this.dropOwnReceipts(trx, id, 'cancel');
      const ownOrder = await this.purchaseOrderRepo.findBySourcePurchaseInvoiceId(trx, id);
      if (ownOrder) await this.dropOwnOrder(trx, ownOrder.id, 'cancel');
      return updated;
    });
  }

  async delete(db: Kysely<TenantDatabase>, id: string): Promise<void> {
    const existing = await this.invoices.findById(db, id);
    if (!existing) throw entityNotFound('PURCHASE_INVOICE', id);
    if (existing.status !== 'draft' && existing.status !== 'cancelled') {
      throw new BusinessRuleError(`Purchase invoice "${id}" is "${existing.status}" and cannot be deleted.`, {
        code: 'PURCHASE_INVOICE.NOT_DELETABLE',
        params: { id, status: existing.status },
      });
    }
    await withTransaction(db, async (trx) => {
      // Read before the delete: the link is ON DELETE SET NULL.
      const ownOrder = await this.purchaseOrderRepo.findBySourcePurchaseInvoiceId(trx, id);
      await this.dropOwnReceipts(trx, id, 'delete');
      await this.invoices.delete(trx, id);
      if (ownOrder) await this.dropOwnOrder(trx, ownOrder.id, 'delete');
    });
  }

  /**
   * The order a direct invoice made for itself goes with it — but only when
   * nothing else (a receipt or invoice made by hand meanwhile) uses it:
   * cancelled with a cancelled invoice, deleted with a deleted one.
   */
  private async dropOwnOrder(trx: Kysely<TenantDatabase>, purchaseOrderId: string, mode: 'cancel' | 'delete'): Promise<void> {
    await lockRowsForUpdate(trx, 'purchase_orders', [purchaseOrderId]);
    const order = await this.purchaseOrderRepo.findById(trx, purchaseOrderId);
    if (!order) return;
    if (mode === 'delete') {
      const [receipt, invoice] = await Promise.all([
        trx.selectFrom('goods_receipts').select('id').where('purchase_order_id', '=', purchaseOrderId).executeTakeFirst(),
        trx.selectFrom('purchase_invoices').select('id').where('purchase_order_id', '=', purchaseOrderId).executeTakeFirst(),
      ]);
      if (!receipt && !invoice) {
        await this.purchaseOrderRepo.delete(trx, purchaseOrderId);
        return;
      }
    }
    if ((order.status === 'draft' || order.status === 'confirmed') && !(await this.purchaseOrdersService.firstLiveDocument(trx, purchaseOrderId))) {
      await this.purchaseOrdersService.cancel(trx, purchaseOrderId);
    }
  }

  /**
   * Locks the purchase order row, refuses unless it can still be invoiced,
   * then locks its lines (document → PO → PO lines) and returns them.
   */
  private async lockInvoiceableOrder(trx: Kysely<TenantDatabase>, purchaseOrderId: string): Promise<PurchaseOrderLine[]> {
    await lockRowsForUpdate(trx, 'purchase_orders', [purchaseOrderId]);
    const po = await this.purchaseOrderRepo.findById(trx, purchaseOrderId);
    if (!po || !INVOICEABLE_ORDER_STATUSES.includes(po.status)) {
      throw new BusinessRuleError(
        `Purchase order "${purchaseOrderId}" is "${po?.status ?? 'missing'}" — only a confirmed purchase order can be invoiced.`,
        {
          code: 'PURCHASE_INVOICE.PURCHASE_ORDER_NOT_INVOICEABLE',
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

  /** Posted invoices + these lines must stay within each PO line's ordered quantity (base units). */
  private async assertWithinOrdered(
    db: Kysely<TenantDatabase>,
    poLines: PurchaseOrderLine[],
    requested: Array<{ purchaseOrderLineId: string; quantityInvoiced: number; unitFactor: number }>,
  ): Promise<void> {
    const invoiced = await this.lines.sumInvoicedBaseQuantityByPurchaseOrderLineIds(db, [
      ...new Set(requested.map((line) => line.purchaseOrderLineId)),
    ]);
    const excess = findQuantityExcess(
      requested.map((line) => ({
        sourceLineId: line.purchaseOrderLineId,
        quantity: line.quantityInvoiced,
        unitFactor: line.unitFactor,
      })),
      new Map(poLines.map((line) => [line.id, toBaseQuantity(line.quantity, line.unitFactor)])),
      invoiced,
    );
    if (!excess) return;
    const factor = poLines.find((line) => line.id === excess.sourceLineId)?.unitFactor ?? 1;
    const params = {
      lineId: excess.sourceLineId,
      quantityInvoiced: inLineUnit(excess.requestedBase, factor),
      remaining: inLineUnit(excess.remainingBase, factor),
      ordered: inLineUnit(excess.limitBase, factor),
      invoiced: inLineUnit(excess.usedBase, factor),
    };
    throw new BusinessRuleError(
      `Cannot invoice ${params.quantityInvoiced} against purchase order line "${params.lineId}" — ` +
        `only ${params.remaining} remaining to invoice (ordered ${params.ordered}, already invoiced ${params.invoiced}).`,
      { code: 'PURCHASE_INVOICE.QUANTITY_EXCEEDS_REMAINING', params },
    );
  }

  /**
   * One supplier bill, one purchase invoice: the supplier's own number
   * can't be on two live (non-cancelled) invoices of the same supplier
   * (case and surrounding spaces ignored). The supplier row lock serializes
   * two concurrent creates for the same supplier. Enforced here, not by a
   * unique index: purchase_invoices has no supplier_id of its own (the
   * supplier is the order's).
   */
  private async assertSupplierNumberUnused(
    trx: Kysely<TenantDatabase>,
    supplierId: string,
    supplierInvoiceNumber: string | null | undefined,
  ): Promise<void> {
    const number = supplierInvoiceNumber?.trim();
    if (!number) return;
    await lockRowsForUpdate(trx, 'suppliers', [supplierId]);
    const existing = await trx
      .selectFrom('purchase_invoices as i')
      .innerJoin('purchase_orders as o', 'o.id', 'i.purchase_order_id')
      .select('i.invoice_number')
      .where('o.supplier_id', '=', supplierId)
      .where('i.status', '!=', 'cancelled')
      .where(sql<string>`lower(btrim(i.supplier_invoice_number))`, '=', number.toLowerCase())
      .executeTakeFirst();
    if (existing) {
      throw new ConflictError(
        `This supplier's invoice number "${number}" is already recorded on purchase invoice "${existing.invoice_number}".`,
        {
          code: 'PURCHASE_INVOICE.DUPLICATE_SUPPLIER_NUMBER',
          params: { value: number, invoiceNumber: existing.invoice_number },
        },
      );
    }
  }

  /** The draft receipt a direct invoice made for itself goes with it (cancelled, or deleted with a deleted invoice). */
  private async dropOwnReceipts(trx: Kysely<TenantDatabase>, invoiceId: string, mode: 'cancel' | 'delete'): Promise<void> {
    for (const receipt of await this.goodsReceiptsService.listMadeByInvoice(trx, invoiceId)) {
      if (receipt.status === 'draft') await this.goodsReceiptsService.cancel(trx, receipt.id);
      if (mode === 'delete' && receipt.status !== 'confirmed') await this.goodsReceiptsService.delete(trx, receipt.id);
    }
  }
}

/** A purchase order an invoice can still be raised / posted against. */
const INVOICEABLE_ORDER_STATUSES: readonly PurchaseOrderStatus[] = ['confirmed', 'partially_received', 'fully_received'];

import { Inject, Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import { withTransaction } from '../../../../database/tenant/transaction.util';
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
  calculatePurchaseInvoiceTotal,
  type PurchaseInvoice,
  type PurchaseInvoiceWithLines,
  type CreatePurchaseInvoiceInput,
} from '../../domain/purchase-invoice.entity';
import type { PurchaseOrderLine } from '../../domain/purchase-order.entity';
import type { GoodsReceiptWithLines } from '../../domain/goods-receipt.entity';
import { BusinessRuleError, NotFoundError, isPostgresForeignKeyViolation } from '../errors';
import { NumberingSequencesService } from '../../../settings/application/services/numbering-sequences.service';
import { OutboxWriterService } from '../../../../shared/outbox/application/services/outbox-writer.service';
import { FeatureAvailabilityService } from '../../../../shared/plans/feature-availability.service';
import { FEATURE_KEYS } from '../../../../shared/plans/feature-catalog';
import { PurchaseOrdersService } from './purchase-orders.service';
import { GoodsReceiptsService } from './goods-receipts.service';
import { PurchasesEventPublisher } from '../../infrastructure/events/purchases-event-publisher';

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
 * One deliberate asymmetry with the Sales side: DeliveriesService.confirm()
 * already writes 'sales.delivery.confirmed' to the Outbox itself (needed
 * for COGS auto-posting), so SalesInvoicesService.create() gets that
 * event for free just by calling it. GoodsReceiptsService.confirm() has
 * NOT been upgraded that way — it still relies on GoodsReceiptsController
 * to publish 'purchases.goods_receipt.confirmed' on the plain Event Bus
 * *after* its own transaction commits (see that controller's comment).
 * Calling goodsReceipts.confirm() directly from here would therefore
 * silently skip the one event Inventory's GoodsReceiptStockListener needs
 * to actually increase stock — a receipt marked "confirmed" in the DB
 * that never moves stock. Rather than changing GoodsReceiptsService's
 * established Event-Bus-not-Outbox design for every existing caller (a
 * bigger, separate decision), create() replicates exactly what the
 * controller would have published, once this call's own transaction has
 * actually committed (ownsTransaction — false only for a hypothetical
 * future nested caller, which does not exist today; see the
 * `withTransaction` usage below).
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
    private readonly outboxWriter: OutboxWriterService,
    private readonly featureAvailability: FeatureAvailabilityService,
    private readonly purchaseOrdersService: PurchaseOrdersService,
    private readonly goodsReceiptsService: GoodsReceiptsService,
    private readonly events: PurchasesEventPublisher,
  ) {}

  list(db: Kysely<TenantDatabase>): Promise<PurchaseInvoice[]> {
    return this.invoices.list(db);
  }

  listByPurchaseOrderId(db: Kysely<TenantDatabase>, purchaseOrderId: string): Promise<PurchaseInvoice[]> {
    return this.invoices.listByPurchaseOrderId(db, purchaseOrderId);
  }

  async getById(db: Kysely<TenantDatabase>, id: string): Promise<PurchaseInvoiceWithLines> {
    const invoice = await this.invoices.findById(db, id);
    if (!invoice) throw new NotFoundError(`Purchase invoice "${id}" not found.`);
    const lines = await this.lines.listByPurchaseInvoiceId(db, id);
    return { ...invoice, lines, totalAmount: calculatePurchaseInvoiceTotal(lines) };
  }

  async create(
    db: Kysely<TenantDatabase>,
    input: CreatePurchaseInvoiceInput,
    schema: string,
    actorUserId: string | null,
  ): Promise<PurchaseInvoiceWithLines> {
    const usingDirectPath = input.purchaseOrderId === undefined;
    if (usingDirectPath) {
      if (!input.supplierId || !input.directLines || input.directLines.length === 0) {
        throw new BusinessRuleError(
          'Provide a purchaseOrderId, or a supplierId with at least one directLines entry, to create a purchase invoice.',
        );
      }
    } else {
      if (input.supplierId || input.directLines) {
        throw new BusinessRuleError(
          'Provide either purchaseOrderId + lines, or supplierId + directLines — not both.',
        );
      }
      if (!input.lines || input.lines.length === 0) {
        throw new BusinessRuleError('A purchase invoice must have at least one line.');
      }
    }

    interface ResolvedInvoiceLine {
      purchaseOrderLineId: string;
      quantityInvoiced: number;
      unitPrice: Money;
      notes: string | null | undefined;
    }

    // See class comment: only the call that actually opens (and, on success,
    // commits) the outer transaction is safe to publish the goods-receipt
    // event after the fact. No caller passes an already-open `trx` today, so
    // this is always true in practice — kept explicit for the same reason
    // `withTransaction` itself exists.
    const ownsTransaction = !db.isTransaction;
    let autoConfirmedReceipt: GoodsReceiptWithLines | null = null;

    let result: PurchaseInvoiceWithLines;
    try {
      result = await withTransaction(db, async (trx) => {
        let poId: string;
        let poLines: PurchaseOrderLine[];
        let resolvedLines: ResolvedInvoiceLine[];

        if (usingDirectPath) {
          const purchaseOrdersEnabled = await this.featureAvailability.isEnabled(
            trx,
            schema,
            FEATURE_KEYS.PURCHASES_PURCHASE_ORDERS,
          );
          if (purchaseOrdersEnabled) {
            throw new BusinessRuleError(
              'Purchase Orders is enabled for this tenant — create a purchase order first, then invoice it.',
            );
          }

          const order = await this.purchaseOrdersService.create(trx, {
            supplierId: input.supplierId!,
            lines: input.directLines!.map((line) => ({
              productVariantId: line.productVariantId,
              quantity: line.quantityInvoiced,
              unitPrice: line.unitPrice,
              notes: line.notes ?? null,
            })),
            customFields: {},
          });
          await this.purchaseOrdersService.confirm(trx, order.id);

          poId = order.id;
          poLines = order.lines;
          resolvedLines = order.lines.map((line) => ({
            purchaseOrderLineId: line.id,
            quantityInvoiced: line.quantity,
            unitPrice: line.unitPrice,
            notes: undefined,
          }));
        } else {
          const po = await this.purchaseOrderRepo.findById(trx, input.purchaseOrderId!);
          if (!po) throw new NotFoundError(`Purchase order "${input.purchaseOrderId}" not found.`);
          if (po.status === 'draft' || po.status === 'cancelled') {
            throw new BusinessRuleError(
              `Purchase order "${input.purchaseOrderId}" is "${po.status}" — only a confirmed purchase order can be invoiced.`,
            );
          }

          poId = po.id;
          poLines = await this.purchaseOrderLines.listByPurchaseOrderId(trx, po.id);
          const poLineById = new Map(poLines.map((line) => [line.id, line]));
          for (const line of input.lines!) {
            if (!poLineById.has(line.purchaseOrderLineId)) {
              throw new NotFoundError(
                `Purchase order line "${line.purchaseOrderLineId}" was not found on purchase order "${po.id}".`,
              );
            }
          }

          const alreadyInvoiced = await this.lines.sumInvoicedQuantityByPurchaseOrderLineIds(
            trx,
            input.lines!.map((line) => line.purchaseOrderLineId),
          );
          for (const line of input.lines!) {
            const poLine = poLineById.get(line.purchaseOrderLineId)!;
            const invoiced = alreadyInvoiced[line.purchaseOrderLineId] ?? 0;
            const remaining = poLine.quantity - invoiced;
            if (line.quantityInvoiced > remaining) {
              throw new BusinessRuleError(
                `Cannot invoice ${line.quantityInvoiced} against purchase order line "${line.purchaseOrderLineId}" — ` +
                  `only ${remaining} remaining to invoice (ordered ${poLine.quantity}, already invoiced ${invoiced}).`,
              );
            }
          }

          resolvedLines = input.lines!.map((line) => ({
            purchaseOrderLineId: line.purchaseOrderLineId,
            quantityInvoiced: line.quantityInvoiced,
            unitPrice: line.unitPrice ?? poLineById.get(line.purchaseOrderLineId)!.unitPrice,
            notes: line.notes,
          }));
        }

        try {
          assertSingleCurrency(resolvedLines);
        } catch (err) {
          throw new BusinessRuleError(err instanceof Error ? err.message : String(err));
        }

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
          const alreadyReceived = await this.goodsReceiptLines.sumReceivedQuantityByPurchaseOrderLineIds(
            trx,
            resolvedLines.map((line) => line.purchaseOrderLineId),
          );
          const poLineQuantityById = new Map(poLines.map((line) => [line.id, line.quantity]));
          const linesToReceive = resolvedLines
            .map((line) => {
              const orderedQuantity = poLineQuantityById.get(line.purchaseOrderLineId) ?? line.quantityInvoiced;
              const received = alreadyReceived[line.purchaseOrderLineId] ?? 0;
              const remaining = Math.max(0, orderedQuantity - received);
              return {
                purchaseOrderLineId: line.purchaseOrderLineId,
                quantityReceived: Math.min(line.quantityInvoiced, remaining),
              };
            })
            .filter((line) => line.quantityReceived > 0);

          if (linesToReceive.length > 0) {
            if (!input.warehouseId) {
              throw new BusinessRuleError(
                'Goods Receipts is disabled for this tenant, so this invoice must record the stock movement a ' +
                  'Goods Receipt normally would — provide a warehouseId.',
              );
            }
            const receipt = await this.goodsReceiptsService.create(trx, {
              purchaseOrderId: poId,
              warehouseId: input.warehouseId,
              lines: linesToReceive.map((line) => ({ ...line, notes: null })),
              customFields: {},
            });
            autoConfirmedReceipt = await this.goodsReceiptsService.confirm(trx, receipt.id);
          }
        }

        const poLineById = new Map(poLines.map((line) => [line.id, line]));
        const allocated = await this.numberingSequences.allocateNext(trx, 'purchase_invoice', null);

        const invoice = await this.invoices.create(trx, {
          invoiceNumber: allocated.formatted,
          supplierInvoiceNumber: input.supplierInvoiceNumber ?? null,
          purchaseOrderId: poId,
          invoiceDate: input.invoiceDate ?? null,
          dueDate: input.dueDate ?? null,
          notes: input.notes ?? null,
          customFields: input.customFields ?? {},
        });

        const createdLines = [];
        for (const line of resolvedLines) {
          const poLine = poLineById.get(line.purchaseOrderLineId)!;
          createdLines.push(
            await this.lines.create(trx, invoice.id, {
              purchaseOrderLineId: line.purchaseOrderLineId,
              productVariantId: poLine.productVariantId,
              quantityInvoiced: line.quantityInvoiced,
              unitPrice: line.unitPrice,
              notes: line.notes ?? null,
            }),
          );
        }

        return { ...invoice, lines: createdLines, totalAmount: calculatePurchaseInvoiceTotal(createdLines) };
      });
    } catch (err) {
      if (isPostgresForeignKeyViolation(err)) {
        throw new NotFoundError('The given purchase order, purchase order line, supplier, or warehouse does not exist.');
      }
      if (err instanceof Error && err.message.includes('No numbering sequence configured')) {
        throw new BusinessRuleError(
          'No numbering sequence configured for purchase invoices yet. ' +
            'Create one for document type "purchase_invoice" via Settings → Numbering Sequences first.',
        );
      }
      throw err;
    }

    if (ownsTransaction && autoConfirmedReceipt) {
      const receipt: GoodsReceiptWithLines = autoConfirmedReceipt;
      this.events.publish('goods_receipt', 'confirmed', {
        schema,
        entityId: receipt.id,
        actorUserId,
        metadata: {
          purchaseOrderId: receipt.purchaseOrderId,
          warehouseId: receipt.warehouseId,
          lines: receipt.lines.map((line) => ({
            productVariantId: line.productVariantId,
            quantity: line.quantityReceived,
            unitCost: { amountMinorUnits: line.unitCost.toMinorUnits().toString(), currency: line.unitCost.currency },
          })),
        },
      });
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
    if (!existing) throw new NotFoundError(`Purchase invoice "${id}" not found.`);
    if (existing.status !== 'draft') {
      throw new BusinessRuleError(
        `Cannot post purchase invoice "${id}" from its current status "${existing.status}" (expected "draft").`,
      );
    }

    const lines = await this.lines.listByPurchaseInvoiceId(db, id);
    if (lines.length === 0) {
      throw new BusinessRuleError(`Purchase invoice "${id}" has no lines and cannot be posted.`);
    }
    const totalAmount = calculatePurchaseInvoiceTotal(lines);

    return withTransaction(db, async (trx) => {
      const updated = await this.invoices.updateStatus(trx, id, 'posted');
      if (!updated) throw new NotFoundError(`Purchase invoice "${id}" not found.`);

      await this.outboxWriter.write(trx, 'purchases.purchase_invoice.posted', {
        schema,
        entityType: 'purchase_invoice',
        entityId: id,
        action: 'posted',
        actorUserId,
        metadata: {
          purchaseOrderId: updated.purchaseOrderId,
          supplierInvoiceNumber: updated.supplierInvoiceNumber,
          totalAmount: { amountMinorUnits: totalAmount.toMinorUnits().toString(), currency: totalAmount.currency },
          lines: lines.map((line) => ({
            productVariantId: line.productVariantId,
            quantity: line.quantityInvoiced,
            unitPrice: { amountMinorUnits: line.unitPrice.toMinorUnits().toString(), currency: line.unitPrice.currency },
          })),
        },
        occurredAt: new Date(),
      });

      return { ...updated, lines, totalAmount };
    });
  }

  async cancel(db: Kysely<TenantDatabase>, id: string): Promise<PurchaseInvoice> {
    const existing = await this.invoices.findById(db, id);
    if (!existing) throw new NotFoundError(`Purchase invoice "${id}" not found.`);
    if (existing.status !== 'draft') {
      throw new BusinessRuleError(
        `Cannot cancel purchase invoice "${id}" from its current status "${existing.status}" (expected "draft") — ` +
          'a posted invoice is a ledger-worthy fact; reversing one needs a real accounting reversal, not a plain cancel.',
      );
    }
    const updated = await this.invoices.updateStatus(db, id, 'cancelled');
    if (!updated) throw new NotFoundError(`Purchase invoice "${id}" not found.`);
    return updated;
  }

  async delete(db: Kysely<TenantDatabase>, id: string): Promise<void> {
    const existing = await this.invoices.findById(db, id);
    if (!existing) throw new NotFoundError(`Purchase invoice "${id}" not found.`);
    if (existing.status !== 'draft' && existing.status !== 'cancelled') {
      throw new BusinessRuleError(`Purchase invoice "${id}" is "${existing.status}" and cannot be deleted.`);
    }
    await this.invoices.delete(db, id);
  }
}

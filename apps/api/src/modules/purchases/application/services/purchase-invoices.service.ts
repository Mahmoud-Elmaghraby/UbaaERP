import { Inject, Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
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
import { Money } from '@erp-platform/shared-kernel';
import {
  assertSingleCurrency,
  calculatePurchaseInvoiceTotal,
  type PurchaseInvoice,
  type PurchaseInvoiceWithLines,
  type CreatePurchaseInvoiceInput,
} from '../../domain/purchase-invoice.entity';
import { BusinessRuleError, NotFoundError, isPostgresForeignKeyViolation } from '../errors';
import { NumberingSequencesService } from '../../../settings/application/services/numbering-sequences.service';
import { OutboxWriterService } from '../../../../shared/outbox/application/services/outbox-writer.service';

/**
 * Purchase Invoices (master doc §10, step 3 — Purchases, Stage 7). The
 * last baseline entity from the master doc's Purchases scope, and this
 * codebase's first genuinely financial document.
 *
 * Same two-step shape as every prior document: create() persists a
 * 'draft' invoice, already validated against how much of the referenced
 * purchase order lines can still be invoiced (partial billing across
 * multiple invoices against one PO, same partial-fulfillment shape as
 * Goods Receipts). post() is the one-way door — and unlike every prior
 * stage's confirm/select action, publishing its integration event is NOT
 * the controller's job: it happens inside post()'s own transaction, via
 * OutboxWriterService, because Outbox correctness requires the outbox
 * record and the status-flip write to be atomic (CLAUDE.md §2.7). Every
 * other document's controller still publishes after the transaction
 * commits, via PurchasesEventPublisher — that's fine for non-financial
 * events (an accepted trade-off, see Stage 5/6's write-ups), but would
 * defeat the entire point of Outbox here.
 *
 * post() therefore needs `schema` and `actorUserId` as real parameters —
 * every other service method in this module only takes `db` plus domain
 * input, because only the controller layer has request context. This is
 * the one deliberate exception, and only for this reason.
 */
@Injectable()
export class PurchaseInvoicesService {
  constructor(
    @Inject(PURCHASE_INVOICE_REPOSITORY) private readonly invoices: PurchaseInvoiceRepository,
    @Inject(PURCHASE_INVOICE_LINE_REPOSITORY) private readonly lines: PurchaseInvoiceLineRepository,
    @Inject(PURCHASE_ORDER_REPOSITORY) private readonly purchaseOrders: PurchaseOrderRepository,
    @Inject(PURCHASE_ORDER_LINE_REPOSITORY) private readonly purchaseOrderLines: PurchaseOrderLineRepository,
    private readonly numberingSequences: NumberingSequencesService,
    private readonly outboxWriter: OutboxWriterService,
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

  async create(db: Kysely<TenantDatabase>, input: CreatePurchaseInvoiceInput): Promise<PurchaseInvoiceWithLines> {
    if (input.lines.length === 0) {
      throw new BusinessRuleError('A purchase invoice must have at least one line.');
    }

    const po = await this.purchaseOrders.findById(db, input.purchaseOrderId);
    if (!po) throw new NotFoundError(`Purchase order "${input.purchaseOrderId}" not found.`);
    if (po.status === 'draft' || po.status === 'cancelled') {
      throw new BusinessRuleError(
        `Purchase order "${input.purchaseOrderId}" is "${po.status}" — only a confirmed purchase order can be invoiced.`,
      );
    }

    const poLines = await this.purchaseOrderLines.listByPurchaseOrderId(db, po.id);
    const poLineById = new Map(poLines.map((line) => [line.id, line]));
    for (const line of input.lines) {
      if (!poLineById.has(line.purchaseOrderLineId)) {
        throw new NotFoundError(
          `Purchase order line "${line.purchaseOrderLineId}" was not found on purchase order "${po.id}".`,
        );
      }
    }

    const alreadyInvoiced = await this.lines.sumInvoicedQuantityByPurchaseOrderLineIds(
      db,
      input.lines.map((line) => line.purchaseOrderLineId),
    );
    for (const line of input.lines) {
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

    interface ResolvedInvoiceLine {
      purchaseOrderLineId: string;
      quantityInvoiced: number;
      unitPrice: Money;
      notes: string | null | undefined;
    }
    const resolvedLines: ResolvedInvoiceLine[] = input.lines.map((line) => ({
      purchaseOrderLineId: line.purchaseOrderLineId,
      quantityInvoiced: line.quantityInvoiced,
      unitPrice: line.unitPrice ?? poLineById.get(line.purchaseOrderLineId)!.unitPrice,
      notes: line.notes,
    }));
    try {
      assertSingleCurrency(resolvedLines);
    } catch (err) {
      throw new BusinessRuleError(err instanceof Error ? err.message : String(err));
    }

    try {
      return await db.transaction().execute(async (trx) => {
        const allocated = await this.numberingSequences.allocateNext(trx, 'purchase_invoice', null);

        const invoice = await this.invoices.create(trx, {
          invoiceNumber: allocated.formatted,
          supplierInvoiceNumber: input.supplierInvoiceNumber ?? null,
          purchaseOrderId: po.id,
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
        throw new NotFoundError('The given purchase order or purchase order line does not exist.');
      }
      if (err instanceof Error && err.message.includes('No numbering sequence configured')) {
        throw new BusinessRuleError(
          'No numbering sequence configured for purchase invoices yet. ' +
            'Create one for document type "purchase_invoice" via Settings → Numbering Sequences first.',
        );
      }
      throw err;
    }
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

    return db.transaction().execute(async (trx) => {
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

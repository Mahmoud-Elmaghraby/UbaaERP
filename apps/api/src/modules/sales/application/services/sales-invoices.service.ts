import { Inject, Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import { withTransaction } from '../../../../database/tenant/transaction.util';
import {
  SALES_INVOICE_REPOSITORY,
  type SalesInvoiceRepository,
} from '../ports/sales-invoice.repository';
import {
  SALES_INVOICE_LINE_REPOSITORY,
  type SalesInvoiceLineRepository,
} from '../ports/sales-invoice-line.repository';
import { SALES_ORDER_REPOSITORY, type SalesOrderRepository } from '../ports/sales-order.repository';
import {
  SALES_ORDER_LINE_REPOSITORY,
  type SalesOrderLineRepository,
} from '../ports/sales-order-line.repository';
import { Money } from '@erp-platform/shared-kernel';
import {
  assertSingleCurrency,
  calculateSalesInvoiceTotal,
  type SalesInvoice,
  type SalesInvoiceWithLines,
  type CreateSalesInvoiceInput,
} from '../../domain/sales-invoice.entity';
import { BusinessRuleError, NotFoundError, isPostgresForeignKeyViolation } from '../errors';
import { NumberingSequencesService } from '../../../settings/application/services/numbering-sequences.service';
import { OutboxWriterService } from '../../../../shared/outbox/application/services/outbox-writer.service';

/**
 * Sales Invoices (master doc §10, step 4 — Sales, Stage 5). This
 * module's first genuinely financial document — direct mirror of
 * PurchaseInvoicesService, down to the Outbox usage. See that class's
 * comment for the full reasoning; not repeated here except where this
 * stage differs.
 *
 * Same two-step shape as every prior Sales document: create() persists
 * a 'draft' invoice, validated against how much of the referenced sales
 * order lines can still be invoiced (partial/advance billing across
 * multiple invoices against one sales order, independent of delivery
 * status — same choice Purchase Invoices made against Goods Receipts).
 * post() is the one-way door, and — like PurchaseInvoicesService.post()
 * — publishing its integration event is NOT the controller's job: it
 * happens inside post()'s own transaction, via OutboxWriterService,
 * because Outbox correctness requires the outbox record and the
 * status-flip write to be atomic (CLAUDE.md §2.7).
 *
 * post() therefore needs `schema` and `actorUserId` as real parameters,
 * same deliberate exception as PurchaseInvoicesService.post() — every
 * other Sales service method only takes `db` plus domain input, because
 * only the controller layer has request context.
 */
@Injectable()
export class SalesInvoicesService {
  constructor(
    @Inject(SALES_INVOICE_REPOSITORY) private readonly invoices: SalesInvoiceRepository,
    @Inject(SALES_INVOICE_LINE_REPOSITORY) private readonly lines: SalesInvoiceLineRepository,
    @Inject(SALES_ORDER_REPOSITORY) private readonly salesOrders: SalesOrderRepository,
    @Inject(SALES_ORDER_LINE_REPOSITORY) private readonly salesOrderLines: SalesOrderLineRepository,
    private readonly numberingSequences: NumberingSequencesService,
    private readonly outboxWriter: OutboxWriterService,
  ) {}

  list(db: Kysely<TenantDatabase>): Promise<SalesInvoice[]> {
    return this.invoices.list(db);
  }

  listBySalesOrderId(db: Kysely<TenantDatabase>, salesOrderId: string): Promise<SalesInvoice[]> {
    return this.invoices.listBySalesOrderId(db, salesOrderId);
  }

  async getById(db: Kysely<TenantDatabase>, id: string): Promise<SalesInvoiceWithLines> {
    const invoice = await this.invoices.findById(db, id);
    if (!invoice) throw new NotFoundError(`Sales invoice "${id}" not found.`);
    const lines = await this.lines.listBySalesInvoiceId(db, id);
    return { ...invoice, lines, totalAmount: calculateSalesInvoiceTotal(lines) };
  }

  async create(db: Kysely<TenantDatabase>, input: CreateSalesInvoiceInput): Promise<SalesInvoiceWithLines> {
    if (input.lines.length === 0) {
      throw new BusinessRuleError('A sales invoice must have at least one line.');
    }

    const order = await this.salesOrders.findById(db, input.salesOrderId);
    if (!order) throw new NotFoundError(`Sales order "${input.salesOrderId}" not found.`);
    if (order.status === 'draft' || order.status === 'cancelled') {
      throw new BusinessRuleError(
        `Sales order "${input.salesOrderId}" is "${order.status}" — only a confirmed sales order can be invoiced.`,
      );
    }

    const orderLines = await this.salesOrderLines.listBySalesOrderId(db, order.id);
    const orderLineById = new Map(orderLines.map((line) => [line.id, line]));
    for (const line of input.lines) {
      if (!orderLineById.has(line.salesOrderLineId)) {
        throw new NotFoundError(
          `Sales order line "${line.salesOrderLineId}" was not found on sales order "${order.id}".`,
        );
      }
    }

    const alreadyInvoiced = await this.lines.sumInvoicedQuantityBySalesOrderLineIds(
      db,
      input.lines.map((line) => line.salesOrderLineId),
    );
    for (const line of input.lines) {
      const orderLine = orderLineById.get(line.salesOrderLineId)!;
      const invoiced = alreadyInvoiced[line.salesOrderLineId] ?? 0;
      const remaining = orderLine.quantity - invoiced;
      if (line.quantityInvoiced > remaining) {
        throw new BusinessRuleError(
          `Cannot invoice ${line.quantityInvoiced} against sales order line "${line.salesOrderLineId}" — ` +
            `only ${remaining} remaining to invoice (ordered ${orderLine.quantity}, already invoiced ${invoiced}).`,
        );
      }
    }

    interface ResolvedInvoiceLine {
      salesOrderLineId: string;
      quantityInvoiced: number;
      unitPrice: Money;
      notes: string | null | undefined;
    }
    const resolvedLines: ResolvedInvoiceLine[] = input.lines.map((line) => ({
      salesOrderLineId: line.salesOrderLineId,
      quantityInvoiced: line.quantityInvoiced,
      unitPrice: line.unitPrice ?? orderLineById.get(line.salesOrderLineId)!.unitPrice,
      notes: line.notes,
    }));
    try {
      assertSingleCurrency(resolvedLines);
    } catch (err) {
      throw new BusinessRuleError(err instanceof Error ? err.message : String(err));
    }

    try {
      return await withTransaction(db, async (trx) => {
        const allocated = await this.numberingSequences.allocateNext(trx, 'sales_invoice', null);

        const invoice = await this.invoices.create(trx, {
          invoiceNumber: allocated.formatted,
          salesOrderId: order.id,
          invoiceDate: input.invoiceDate ?? null,
          dueDate: input.dueDate ?? null,
          notes: input.notes ?? null,
          customFields: input.customFields ?? {},
        });

        const createdLines = [];
        for (const line of resolvedLines) {
          const orderLine = orderLineById.get(line.salesOrderLineId)!;
          createdLines.push(
            await this.lines.create(trx, invoice.id, {
              salesOrderLineId: line.salesOrderLineId,
              productVariantId: orderLine.productVariantId,
              quantityInvoiced: line.quantityInvoiced,
              unitPrice: line.unitPrice,
              notes: line.notes ?? null,
            }),
          );
        }

        return { ...invoice, lines: createdLines, totalAmount: calculateSalesInvoiceTotal(createdLines) };
      });
    } catch (err) {
      if (isPostgresForeignKeyViolation(err)) {
        throw new NotFoundError('The given sales order or sales order line does not exist.');
      }
      if (err instanceof Error && err.message.includes('No numbering sequence configured')) {
        throw new BusinessRuleError(
          'No numbering sequence configured for sales invoices yet. ' +
            'Create one for document type "sales_invoice" via Settings → Numbering Sequences first.',
        );
      }
      throw err;
    }
  }

  /**
   * The one-way door, and the reason this stage needs the (already
   * globally available) Outbox. In one DB transaction: flips the
   * invoice to 'posted', then writes the outbox record for
   * 'sales.sales_invoice.posted' — atomically, via OutboxWriterService,
   * using the SAME `trx`. Nothing is published on the plain Event Bus
   * here; OutboxDispatcherService (shared/outbox/) picks the row up on
   * its own schedule and does that. This is also the eventual trigger
   * point for the ETA e-invoice submission engine (not built here —
   * claude/sales-einvoice-spike.md §6).
   */
  async post(
    db: Kysely<TenantDatabase>,
    id: string,
    schema: string,
    actorUserId: string | null,
  ): Promise<SalesInvoiceWithLines> {
    const existing = await this.invoices.findById(db, id);
    if (!existing) throw new NotFoundError(`Sales invoice "${id}" not found.`);
    if (existing.status !== 'draft') {
      throw new BusinessRuleError(
        `Cannot post sales invoice "${id}" from its current status "${existing.status}" (expected "draft").`,
      );
    }

    const lines = await this.lines.listBySalesInvoiceId(db, id);
    if (lines.length === 0) {
      throw new BusinessRuleError(`Sales invoice "${id}" has no lines and cannot be posted.`);
    }
    const totalAmount = calculateSalesInvoiceTotal(lines);

    return withTransaction(db, async (trx) => {
      const updated = await this.invoices.updateStatus(trx, id, 'posted');
      if (!updated) throw new NotFoundError(`Sales invoice "${id}" not found.`);

      await this.outboxWriter.write(trx, 'sales.sales_invoice.posted', {
        schema,
        entityType: 'sales_invoice',
        entityId: id,
        action: 'posted',
        actorUserId,
        metadata: {
          salesOrderId: updated.salesOrderId,
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

  async cancel(db: Kysely<TenantDatabase>, id: string): Promise<SalesInvoice> {
    const existing = await this.invoices.findById(db, id);
    if (!existing) throw new NotFoundError(`Sales invoice "${id}" not found.`);
    if (existing.status !== 'draft') {
      throw new BusinessRuleError(
        `Cannot cancel sales invoice "${id}" from its current status "${existing.status}" (expected "draft") — ` +
          'a posted invoice is a ledger-worthy fact; reversing one needs a real accounting reversal, not a plain cancel.',
      );
    }
    const updated = await this.invoices.updateStatus(db, id, 'cancelled');
    if (!updated) throw new NotFoundError(`Sales invoice "${id}" not found.`);
    return updated;
  }

  async delete(db: Kysely<TenantDatabase>, id: string): Promise<void> {
    const existing = await this.invoices.findById(db, id);
    if (!existing) throw new NotFoundError(`Sales invoice "${id}" not found.`);
    if (existing.status !== 'draft' && existing.status !== 'cancelled') {
      throw new BusinessRuleError(`Sales invoice "${id}" is "${existing.status}" and cannot be deleted.`);
    }
    await this.invoices.delete(db, id);
  }
}

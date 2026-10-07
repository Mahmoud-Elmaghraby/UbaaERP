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
import { DELIVERY_LINE_REPOSITORY, type DeliveryLineRepository } from '../ports/delivery-line.repository';
import { Money } from '@erp-platform/shared-kernel';
import {
  assertSingleCurrency,
  calculateSalesInvoiceTotal,
  type SalesInvoice,
  type SalesInvoiceWithLines,
  type CreateSalesInvoiceInput,
} from '../../domain/sales-invoice.entity';
import type { SalesOrderLine } from '../../domain/sales-order.entity';
import { BusinessRuleError, isPostgresForeignKeyViolation } from '../errors';
import { entityNotFound } from '../../../../shared/errors/entity-errors';
import { NumberingSequencesService } from '../../../settings/application/services/numbering-sequences.service';
import { TenantSettingsService } from '../../../settings/application/services/tenant-settings.service';
import { OutboxWriterService } from '../../../../shared/outbox/application/services/outbox-writer.service';
import { FeatureAvailabilityService } from '../../../../shared/plans/feature-availability.service';
import { FEATURE_KEYS } from '../../../../shared/plans/feature-catalog';
import { assertCurrencyAllowedForTenant } from '../../../../shared/plans/currency-gate';
import { SalesOrdersService } from './sales-orders.service';
import { DeliveriesService } from './deliveries.service';

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
 * same deliberate exception as PurchaseInvoicesService.post(). create()
 * now needs them too — see "Invoice-takeover orchestrator" below.
 *
 * ## Invoice-takeover orchestrator (claude/platform-flexibility-strategy.md)
 *
 * Sales Orders and Deliveries are each independently toggleable
 * (Layer 1 Plan ceiling + Layer 2 tenant self-service — PlanFeatureGuard
 * blocks their own controllers' non-GET methods once disabled). But
 * SalesInvoicesService.create() has always had a hard technical
 * dependency on an existing, confirmed Sales Order (its FK), and Delivery
 * confirmation is where COGS/stock deduction actually happens (Inventory's
 * DeliveryStockListener, never Invoice posting — see PosSalesService's own
 * comment for this same "key finding"). So a tenant that disables Sales
 * Orders and/or Deliveries would otherwise have no way to invoice at all,
 * or would silently skip stock/COGS entirely. create() now closes both
 * gaps, using the exact same proven pattern PosSalesService.checkout()
 * already ships: create the disabled step(s) automatically and
 * invisibly, inside the SAME transaction as the invoice, reusing
 * SalesOrdersService/DeliveriesService's own create()/confirm() methods
 * — no shortcut logic duplicated here, no bypass of Outbox/event wiring.
 *
 * Two independent checks, each only when the caller needs that step:
 * - No salesOrderId given (the "direct" path — customerId + directLines
 *   instead): allowed only when SALES_SALES_ORDERS is NOT effectively
 *   enabled for the tenant (FeatureAvailabilityService — Layer 1 AND
 *   Layer 2 combined, same check PlanFeatureGuard applies from the JWT).
 *   If it IS enabled, this is rejected — a tenant that keeps Sales Orders
 *   on has chosen to require a real one for every sale, and this path
 *   must not let that be routed around.
 * - Whichever Sales Order ends up resolved (given, or just auto-created):
 *   if SALES_DELIVERIES is NOT effectively enabled, a matching Delivery
 *   is auto-created+confirmed covering exactly the quantities THIS
 *   invoice is billing (not the whole order — correct for partial
 *   invoicing over multiple calls against one order) before the invoice
 *   itself is written. If Deliveries IS enabled, behavior is completely
 *   unchanged from before this pass — a real Delivery still has to be
 *   created separately, exactly as today (an accepted, pre-existing risk
 *   profile, not a new one).
 */
@Injectable()
export class SalesInvoicesService {
  constructor(
    @Inject(SALES_INVOICE_REPOSITORY) private readonly invoices: SalesInvoiceRepository,
    @Inject(SALES_INVOICE_LINE_REPOSITORY) private readonly lines: SalesInvoiceLineRepository,
    @Inject(SALES_ORDER_REPOSITORY) private readonly salesOrderRepo: SalesOrderRepository,
    @Inject(SALES_ORDER_LINE_REPOSITORY) private readonly salesOrderLines: SalesOrderLineRepository,
    @Inject(DELIVERY_LINE_REPOSITORY) private readonly deliveryLines: DeliveryLineRepository,
    private readonly numberingSequences: NumberingSequencesService,
    private readonly tenantSettings: TenantSettingsService,
    private readonly outboxWriter: OutboxWriterService,
    private readonly featureAvailability: FeatureAvailabilityService,
    private readonly salesOrdersService: SalesOrdersService,
    private readonly deliveriesService: DeliveriesService,
  ) {}

  list(db: Kysely<TenantDatabase>): Promise<SalesInvoice[]> {
    return this.invoices.list(db);
  }

  listBySalesOrderId(db: Kysely<TenantDatabase>, salesOrderId: string): Promise<SalesInvoice[]> {
    return this.invoices.listBySalesOrderId(db, salesOrderId);
  }

  async getById(db: Kysely<TenantDatabase>, id: string): Promise<SalesInvoiceWithLines> {
    const invoice = await this.invoices.findById(db, id);
    if (!invoice) throw entityNotFound('SALES_INVOICE', id);
    const lines = await this.lines.listBySalesInvoiceId(db, id);
    return { ...invoice, lines, totalAmount: calculateSalesInvoiceTotal(lines) };
  }

  async create(
    db: Kysely<TenantDatabase>,
    input: CreateSalesInvoiceInput,
    schema: string,
    actorUserId: string | null,
  ): Promise<SalesInvoiceWithLines> {
    const usingDirectPath = input.salesOrderId === undefined;
    if (usingDirectPath) {
      if (!input.customerId || !input.directLines || input.directLines.length === 0) {
        throw new BusinessRuleError(
          'Provide a salesOrderId, or a customerId with at least one directLines entry, to create a sales invoice.',
          { code: 'SALES_INVOICE.MISSING_DIRECT_SOURCE' },
        );
      }
    } else {
      if (input.customerId || input.directLines) {
        throw new BusinessRuleError(
          'Provide either salesOrderId + lines, or customerId + directLines — not both.',
          { code: 'SALES_INVOICE.AMBIGUOUS_SOURCE' },
        );
      }
      if (!input.lines || input.lines.length === 0) {
        throw new BusinessRuleError('A sales invoice must have at least one line.', {
          code: 'SALES_INVOICE.AT_LEAST_ONE_LINE_REQUIRED',
        });
      }
    }

    try {
      return await withTransaction(db, async (trx) => {
        let orderId: string;
        let orderLines: SalesOrderLine[];
        let resolvedLines: { salesOrderLineId: string; quantityInvoiced: number; unitPrice: Money; notes: string | null | undefined }[];

        if (usingDirectPath) {
          const salesOrdersEnabled = await this.featureAvailability.isEnabled(
            trx,
            schema,
            FEATURE_KEYS.SALES_SALES_ORDERS,
          );
          if (salesOrdersEnabled) {
            throw new BusinessRuleError(
              'Sales Orders is enabled for this tenant — create a sales order first, then invoice it.',
              { code: 'SALES_INVOICE.SALES_ORDERS_REQUIRED' },
            );
          }

          const order = await this.salesOrdersService.create(
            trx,
            {
              customerId: input.customerId!,
              lines: input.directLines!.map((line) => ({
                productVariantId: line.productVariantId,
                quantity: line.quantity,
                unitPrice: line.unitPrice,
                notes: line.notes ?? null,
                unitOfMeasureId: line.unitOfMeasureId ?? null,
              })),
              customFields: {},
            },
            schema,
          );
          await this.salesOrdersService.confirm(trx, order.id);

          orderId = order.id;
          orderLines = order.lines;
          resolvedLines = order.lines.map((line) => ({
            salesOrderLineId: line.id,
            quantityInvoiced: line.quantity,
            unitPrice: line.unitPrice,
            notes: undefined,
          }));
        } else {
          const order = await this.salesOrderRepo.findById(trx, input.salesOrderId!);
          if (!order) throw entityNotFound('SALES_ORDER', input.salesOrderId);
          if (order.status === 'draft' || order.status === 'cancelled') {
            throw new BusinessRuleError(
              `Sales order "${input.salesOrderId}" is "${order.status}" — only a confirmed sales order can be invoiced.`,
              { code: 'SALES_INVOICE.SALES_ORDER_NOT_INVOICEABLE', params: { id: input.salesOrderId ?? '', status: order.status } },
            );
          }

          orderId = order.id;
          orderLines = await this.salesOrderLines.listBySalesOrderId(trx, order.id);
          const orderLineById = new Map(orderLines.map((line) => [line.id, line]));
          for (const line of input.lines!) {
            if (!orderLineById.has(line.salesOrderLineId)) {
              throw new BusinessRuleError(
                `Sales order line "${line.salesOrderLineId}" was not found on sales order "${order.id}".`,
                {
                  code: 'SALES_INVOICE.SALES_ORDER_LINE_NOT_FOUND',
                  params: { lineId: line.salesOrderLineId, salesOrderId: order.id },
                },
              );
            }
          }

          const alreadyInvoiced = await this.lines.sumInvoicedQuantityBySalesOrderLineIds(
            trx,
            input.lines!.map((line) => line.salesOrderLineId),
          );
          for (const line of input.lines!) {
            const orderLine = orderLineById.get(line.salesOrderLineId)!;
            const invoiced = alreadyInvoiced[line.salesOrderLineId] ?? 0;
            const remaining = orderLine.quantity - invoiced;
            if (line.quantityInvoiced > remaining) {
              throw new BusinessRuleError(
                `Cannot invoice ${line.quantityInvoiced} against sales order line "${line.salesOrderLineId}" — ` +
                  `only ${remaining} remaining to invoice (ordered ${orderLine.quantity}, already invoiced ${invoiced}).`,
                {
                  code: 'SALES_INVOICE.QUANTITY_EXCEEDS_REMAINING',
                  params: {
                    lineId: line.salesOrderLineId,
                    quantityInvoiced: line.quantityInvoiced,
                    remaining,
                    ordered: orderLine.quantity,
                    invoiced,
                  },
                },
              );
            }
          }

          resolvedLines = input.lines!.map((line) => ({
            salesOrderLineId: line.salesOrderLineId,
            quantityInvoiced: line.quantityInvoiced,
            unitPrice: line.unitPrice ?? orderLineById.get(line.salesOrderLineId)!.unitPrice,
            notes: line.notes,
          }));
        }

        try {
          assertSingleCurrency(resolvedLines);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          throw new BusinessRuleError(message, { code: 'SALES_INVOICE.MULTIPLE_CURRENCIES', params: { reason: message } });
        }

        // Multi-currency gate (claude/multi-currency-strategy.md §9): a
        // line's currency can still differ from the tenant's own here even
        // though the source sales order already passed this same check at
        // its own creation — an existing-order invoice can override a
        // line's unitPrice (see resolvedLines above), so this is re-checked
        // against the FINAL resolved lines, not assumed from the order.
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
            code: 'SALES_INVOICE.MULTI_CURRENCY_DISABLED',
            params: { currency: invoiceCurrency, tenantCurrency },
          });
        }

        const deliveriesEnabled = await this.featureAvailability.isEnabled(
          trx,
          schema,
          FEATURE_KEYS.SALES_DELIVERIES,
        );
        if (!deliveriesEnabled) {
          // Guard against double-delivering: the direct-invoicing path's
          // freshly-created order is always undelivered, but the
          // existing-salesOrderId path can be handed an order that was
          // ALREADY fully (or partially) delivered by something else that
          // isn't gated by this toggle — most notably PosSalesService.
          // checkout(), which always creates+confirms its own Delivery
          // for the whole order regardless of Layer 2 state. Only the
          // portion of each line not yet covered by an existing confirmed
          // delivery gets auto-delivered here.
          const alreadyDelivered = await this.deliveryLines.sumDeliveredQuantityBySalesOrderLineIds(
            trx,
            resolvedLines.map((line) => line.salesOrderLineId),
          );
          const orderLineQuantityById = new Map(orderLines.map((line) => [line.id, line.quantity]));
          const linesToDeliver = resolvedLines
            .map((line) => {
              const orderedQuantity = orderLineQuantityById.get(line.salesOrderLineId) ?? line.quantityInvoiced;
              const delivered = alreadyDelivered[line.salesOrderLineId] ?? 0;
              const remaining = Math.max(0, orderedQuantity - delivered);
              return {
                salesOrderLineId: line.salesOrderLineId,
                quantityDelivered: Math.min(line.quantityInvoiced, remaining),
              };
            })
            .filter((line) => line.quantityDelivered > 0);

          if (linesToDeliver.length > 0) {
            if (!input.warehouseId) {
              throw new BusinessRuleError(
                'Deliveries is disabled for this tenant, so this invoice must record the stock movement a ' +
                  'Delivery normally would — provide a warehouseId.',
                { code: 'SALES_INVOICE.WAREHOUSE_REQUIRED' },
              );
            }
            const delivery = await this.deliveriesService.create(trx, {
              salesOrderId: orderId,
              warehouseId: input.warehouseId,
              lines: linesToDeliver.map((line) => ({ ...line, notes: null })),
              customFields: {},
            });
            await this.deliveriesService.confirm(trx, delivery.id, schema, actorUserId);
          }
        }

        const orderLineById = new Map(orderLines.map((line) => [line.id, line]));
        const allocated = await this.numberingSequences.allocateNext(trx, 'sales_invoice', null);

        const invoice = await this.invoices.create(trx, {
          invoiceNumber: allocated.formatted,
          salesOrderId: orderId,
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
              unitOfMeasureId: orderLine.unitOfMeasureId,
              unitFactor: orderLine.unitFactor,
            }),
          );
        }

        return { ...invoice, lines: createdLines, totalAmount: calculateSalesInvoiceTotal(createdLines) };
      });
    } catch (err) {
      if (isPostgresForeignKeyViolation(err)) {
        throw new BusinessRuleError('The given sales order, sales order line, customer, or warehouse does not exist.', {
          code: 'SALES_INVOICE.SOURCE_NOT_FOUND',
        });
      }
      if (err instanceof Error && err.message.includes('No numbering sequence configured')) {
        throw new BusinessRuleError(
          'No numbering sequence configured for sales invoices yet. ' +
            'Create one for document type "sales_invoice" via Settings → Numbering Sequences first.',
          { code: 'SALES_INVOICE.NO_NUMBERING_SEQUENCE' },
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
    if (!existing) throw entityNotFound('SALES_INVOICE', id);
    if (existing.status !== 'draft') {
      throw new BusinessRuleError(
        `Cannot post sales invoice "${id}" from its current status "${existing.status}" (expected "draft").`,
        { code: 'SALES_INVOICE.NOT_POSTABLE', params: { id, status: existing.status } },
      );
    }

    const lines = await this.lines.listBySalesInvoiceId(db, id);
    if (lines.length === 0) {
      throw new BusinessRuleError(`Sales invoice "${id}" has no lines and cannot be posted.`, {
        code: 'SALES_INVOICE.NO_LINES',
        params: { id },
      });
    }
    const totalAmount = calculateSalesInvoiceTotal(lines);

    return withTransaction(db, async (trx) => {
      const updated = await this.invoices.updateStatus(trx, id, 'posted');
      if (!updated) throw entityNotFound('SALES_INVOICE', id);

      await this.outboxWriter.write(trx, 'sales.sales_invoice.posted', {
        schema,
        entityType: 'sales_invoice',
        entityId: id,
        action: 'posted',
        actorUserId,
        metadata: {
          salesOrderId: updated.salesOrderId,
          invoiceNumber: updated.invoiceNumber,
          invoiceDate: updated.invoiceDate,
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
    if (!existing) throw entityNotFound('SALES_INVOICE', id);
    if (existing.status !== 'draft') {
      throw new BusinessRuleError(
        `Cannot cancel sales invoice "${id}" from its current status "${existing.status}" (expected "draft") — ` +
          'a posted invoice is a ledger-worthy fact; reversing one needs a real accounting reversal, not a plain cancel.',
        { code: 'SALES_INVOICE.NOT_CANCELLABLE', params: { id, status: existing.status } },
      );
    }
    const updated = await this.invoices.updateStatus(db, id, 'cancelled');
    if (!updated) throw entityNotFound('SALES_INVOICE', id);
    return updated;
  }

  async delete(db: Kysely<TenantDatabase>, id: string): Promise<void> {
    const existing = await this.invoices.findById(db, id);
    if (!existing) throw entityNotFound('SALES_INVOICE', id);
    if (existing.status !== 'draft' && existing.status !== 'cancelled') {
      throw new BusinessRuleError(`Sales invoice "${id}" is "${existing.status}" and cannot be deleted.`, {
        code: 'SALES_INVOICE.NOT_DELETABLE',
        params: { id, status: existing.status },
      });
    }
    await this.invoices.delete(db, id);
  }
}

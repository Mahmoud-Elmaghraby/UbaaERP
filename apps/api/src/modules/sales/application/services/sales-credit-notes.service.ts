import { Inject, Injectable } from '@nestjs/common';
import { computeLineTaxes, type Money, type TaxRateInput } from '@erp-platform/shared-kernel';
import { computeDocumentTaxes, toSnapshot, type LineTaxSnapshot } from '../../../../shared/taxes/document-taxes';
import {
  SALES_INVOICE_LINE_REPOSITORY,
  type SalesInvoiceLineRepository,
} from '../ports/sales-invoice-line.repository';
import {
  distributeOrderTotalAcrossLines,
  type SalesOrder,
  type SalesOrderLine,
} from '../../domain/sales-order.entity';
import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import {
  SALES_CREDIT_NOTE_REPOSITORY,
  type SalesCreditNoteRepository,
} from '../ports/sales-credit-note.repository';
import {
  SALES_CREDIT_NOTE_LINE_REPOSITORY,
  type SalesCreditNoteLineRepository,
} from '../ports/sales-credit-note-line.repository';
import { DELIVERY_REPOSITORY, type DeliveryRepository } from '../ports/delivery.repository';
import { DELIVERY_LINE_REPOSITORY, type DeliveryLineRepository } from '../ports/delivery-line.repository';
import { SALES_ORDER_REPOSITORY, type SalesOrderRepository } from '../ports/sales-order.repository';
import {
  SALES_ORDER_LINE_REPOSITORY,
  type SalesOrderLineRepository,
} from '../ports/sales-order-line.repository';
import type { SalesReturnWithLines } from '../../domain/sales-return.entity';
import {
  calculateSalesCreditNoteTotals,
  type SalesCreditNote,
  type SalesCreditNoteWithLines,
} from '../../domain/sales-credit-note.entity';
import { BusinessRuleError } from '../errors';
import { entityNotFound } from '../../../../shared/errors/entity-errors';
import { NumberingSequencesService } from '../../../settings/application/services/numbering-sequences.service';

/**
 * Auto-generates exactly one Sales Credit Note the moment a Sales
 * Return is confirmed — see migration 0053's class comment for the full
 * design (no user-facing create, price sourced from the original
 * sales_order_line, not traced through invoices). The only writer is
 * createFromSalesReturn(), called exclusively by
 * SalesReturnsService.confirm() with an already-open transaction —
 * `trx` below is always that transaction, never a fresh `db`, so the
 * credit note and the return's own status flip either both commit or
 * neither does.
 */
@Injectable()
export class SalesCreditNotesService {
  constructor(
    @Inject(SALES_CREDIT_NOTE_REPOSITORY) private readonly creditNotes: SalesCreditNoteRepository,
    @Inject(SALES_CREDIT_NOTE_LINE_REPOSITORY) private readonly lines: SalesCreditNoteLineRepository,
    @Inject(DELIVERY_REPOSITORY) private readonly deliveries: DeliveryRepository,
    @Inject(DELIVERY_LINE_REPOSITORY) private readonly deliveryLines: DeliveryLineRepository,
    @Inject(SALES_ORDER_REPOSITORY) private readonly salesOrders: SalesOrderRepository,
    @Inject(SALES_ORDER_LINE_REPOSITORY) private readonly salesOrderLines: SalesOrderLineRepository,
    @Inject(SALES_INVOICE_LINE_REPOSITORY) private readonly invoiceLines: SalesInvoiceLineRepository,
    private readonly numberingSequences: NumberingSequencesService,
  ) {}

  list(db: Kysely<TenantDatabase>): Promise<SalesCreditNote[]> {
    return this.creditNotes.list(db);
  }

  async getById(db: Kysely<TenantDatabase>, id: string): Promise<SalesCreditNoteWithLines> {
    const creditNote = await this.creditNotes.findById(db, id);
    if (!creditNote) throw entityNotFound('SALES_CREDIT_NOTE', id);
    const lines = await this.lines.listBySalesCreditNoteId(db, id);
    return { ...creditNote, lines, ...calculateSalesCreditNoteTotals(lines) };
  }

  async findBySalesReturnId(
    db: Kysely<TenantDatabase>,
    salesReturnId: string,
  ): Promise<SalesCreditNoteWithLines | null> {
    const creditNote = await this.creditNotes.findBySalesReturnId(db, salesReturnId);
    if (!creditNote) return null;
    const lines = await this.lines.listBySalesCreditNoteId(db, creditNote.id);
    return { ...creditNote, lines, ...calculateSalesCreditNoteTotals(lines) };
  }

  /**
   * Resolves customerId + each line's unitPrice by walking
   * sales_return_line -> delivery_line -> sales_order_line — see
   * migration 0053's own comment for why this, not invoice tracing.
   */
  async createFromSalesReturn(
    trx: Kysely<TenantDatabase>,
    salesReturn: SalesReturnWithLines,
  ): Promise<SalesCreditNoteWithLines> {
    const delivery = await this.deliveries.findById(trx, salesReturn.deliveryId);
    if (!delivery) throw entityNotFound('DELIVERY', salesReturn.deliveryId);

    const order = await this.salesOrders.findById(trx, delivery.salesOrderId);
    if (!order) throw entityNotFound('SALES_ORDER', delivery.salesOrderId);

    const deliveryLinesList = await this.deliveryLines.listByDeliveryId(trx, delivery.id);
    const deliveryLineById = new Map(deliveryLinesList.map((line) => [line.id, line]));

    const orderLinesList = await this.salesOrderLines.listBySalesOrderId(trx, order.id);
    const orderLineById = new Map(orderLinesList.map((line) => [line.id, line]));

    const pricing = await this.returnPricing(trx, order, orderLinesList);

    const lineInputs = salesReturn.lines.map((returnLine) => {
      const deliveryLine = deliveryLineById.get(returnLine.deliveryLineId);
      if (!deliveryLine) {
        throw new BusinessRuleError(
          `Delivery line "${returnLine.deliveryLineId}" referenced by sales return line "${returnLine.id}" was not found.`,
          {
            code: 'SALES_CREDIT_NOTE.DELIVERY_LINE_NOT_FOUND',
            params: { lineId: returnLine.deliveryLineId, returnLineId: returnLine.id },
          },
        );
      }
      const orderLine = orderLineById.get(deliveryLine.salesOrderLineId);
      if (!orderLine) {
        throw new BusinessRuleError(
          `Sales order line "${deliveryLine.salesOrderLineId}" referenced by delivery line "${deliveryLine.id}" was not found.`,
          {
            code: 'SALES_CREDIT_NOTE.SALES_ORDER_LINE_NOT_FOUND',
            params: { lineId: deliveryLine.salesOrderLineId, deliveryLineId: deliveryLine.id },
          },
        );
      }
      return { returnLine, orderLine };
    });

    const priced = await pricing.price(
      lineInputs.map(({ returnLine, orderLine }) => ({
        orderLine,
        baseQuantity: returnLine.quantityReturned * returnLine.unitFactor,
      })),
    );
    const finalLines = lineInputs.map(({ returnLine }, index) => {
      const { net, taxes } = priced[index]!;
      return {
        salesReturnLineId: returnLine.id,
        productVariantId: returnLine.productVariantId,
        quantity: returnLine.quantityReturned,
        unitPrice: net.divideByQuantity(returnLine.quantityReturned),
        netAmount: net,
        taxes,
        unitOfMeasureId: returnLine.unitOfMeasureId,
        unitFactor: returnLine.unitFactor,
      };
    });

    const currency = finalLines[0]?.unitPrice.currency;
    if (!currency) {
      throw new BusinessRuleError('A sales credit note needs at least one line.', {
        code: 'SALES_CREDIT_NOTE.AT_LEAST_ONE_LINE_REQUIRED',
      });
    }

    let allocated;
    try {
      allocated = await this.numberingSequences.allocateNext(trx, 'sales_credit_note', null);
    } catch (err) {
      if (err instanceof Error && err.message.includes('No numbering sequence configured')) {
        throw new BusinessRuleError(
          'No numbering sequence configured for sales credit notes yet. ' +
            'Create one for document type "sales_credit_note" via Settings → Numbering Sequences first.',
          { code: 'SALES_CREDIT_NOTE.NO_NUMBERING_SEQUENCE' },
        );
      }
      throw err;
    }

    const creditNote = await this.creditNotes.create(trx, {
      creditNoteNumber: allocated.formatted,
      salesReturnId: salesReturn.id,
      customerId: order.customerId,
      currency,
      notes: null,
      customFields: {},
    });

    const createdLines = [];
    for (const lineInput of finalLines) {
      createdLines.push(await this.lines.create(trx, creditNote.id, lineInput));
    }

    return { ...creditNote, lines: createdLines, ...calculateSalesCreditNoteTotals(createdLines) };
  }

  /**
   * What a returned quantity is credited at: the price and taxes it was
   * INVOICED at (posted invoices of that order line, pro rata by base
   * quantity), so a credit note exactly reverses its share of the invoice —
   * discounts and VAT included. A return before any invoice falls back to
   * the order's discounted price with today's default taxes.
   */
  private async returnPricing(
    trx: Kysely<TenantDatabase>,
    order: SalesOrder,
    orderLines: SalesOrderLine[],
  ) {
    const invoiced = await this.invoiceLines.listPostedBySalesOrderLineIds(
      trx,
      orderLines.map((line) => line.id),
    );
    const byOrderLine = new Map<string, { net: Money; baseQuantity: number; rates: TaxRateInput[] }>();
    for (const line of invoiced) {
      const entry = byOrderLine.get(line.salesOrderLineId);
      const baseQuantity = line.quantityInvoiced * line.unitFactor;
      if (entry) {
        entry.net = entry.net.add(line.netAmount);
        entry.baseQuantity += baseQuantity;
      } else {
        byOrderLine.set(line.salesOrderLineId, {
          net: line.netAmount,
          baseQuantity,
          rates: line.taxes.map((tax) => ({
            taxRuleId: tax.taxRuleId,
            name: tax.name,
            kind: tax.kind,
            rate: tax.rate,
            etaType: tax.etaType,
            etaSubtype: tax.etaSubtype,
          })),
        });
      }
    }
    const discounted = distributeOrderTotalAcrossLines(order, orderLines);
    const orderIndex = new Map(orderLines.map((line, index) => [line.id, index]));

    return {
      price: async (lines: { orderLine: SalesOrderLine; baseQuantity: number }[]) => {
        const results: { net: Money; taxes: LineTaxSnapshot[] }[] = [];
        const uninvoiced: { index: number; productVariantId: string; net: Money }[] = [];
        lines.forEach(({ orderLine, baseQuantity }, index) => {
          const invoicedLine = byOrderLine.get(orderLine.id);
          if (invoicedLine && invoicedLine.baseQuantity > 0) {
            const net = invoicedLine.net.multiplyByQuantity(baseQuantity / invoicedLine.baseQuantity);
            const result = computeLineTaxes(net.toMinorUnits(), invoicedLine.rates);
            results[index] = { net, taxes: toSnapshot(result.taxes) };
          } else {
            const orderBase = orderLine.quantity * orderLine.unitFactor;
            const net = discounted[orderIndex.get(orderLine.id)!]!.multiplyByQuantity(baseQuantity / orderBase);
            uninvoiced.push({ index, productVariantId: orderLine.productVariantId, net });
          }
        });
        if (uninvoiced.length > 0) {
          const customer = await trx
            .selectFrom('customers')
            .select('withholding_tax_rule_id')
            .where('id', '=', order.customerId)
            .executeTakeFirst();
          const computed = await computeDocumentTaxes(trx, {
            scope: 'sales',
            partyWithholdingRuleId: customer?.withholding_tax_rule_id ?? null,
            lines: uninvoiced.map((line) => ({ productVariantId: line.productVariantId, amountMinor: line.net.toMinorUnits() })),
          });
          uninvoiced.forEach((line, i) => {
            results[line.index] = { net: line.net, taxes: toSnapshot(computed[i]!.taxes) };
          });
        }
        return results;
      },
    };
  }
}

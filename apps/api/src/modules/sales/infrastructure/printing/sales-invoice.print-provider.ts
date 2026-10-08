import { localIsoDate } from '../../../../shared/time/local-date';
import { Inject, Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import { Money } from '@erp-platform/shared-kernel';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import type { PrintDocumentBody, PrintProvider } from '../../../../shared/printing/print-provider';
import {
  documentTotalsDto,
  lineTaxesDto,
  moneyDto,
  readPrintLabels,
  statusLabel,
} from '../../../../shared/printing/print-helpers';
import { SalesInvoicesService } from '../../application/services/sales-invoices.service';
import { SALES_ORDER_REPOSITORY, type SalesOrderRepository } from '../../application/ports/sales-order.repository';
import { CUSTOMER_REPOSITORY, type CustomerRepository } from '../../application/ports/customer.repository';
import {
  PAYMENT_ALLOCATION_REPOSITORY,
  type PaymentAllocationRepository,
} from '../../application/ports/payment-allocation.repository';
import { customerParty } from './sales-print-shared';

/**
 * فاتورة ضريبية — A4, and the 80 mm till receipt for POS sales (same
 * document, different layout). Paid / remaining come from posted receipts.
 */
@Injectable()
export class SalesInvoicePrintProvider implements PrintProvider {
  readonly documentType = 'sales_invoice';
  readonly label = 'فاتورة بيع';
  readonly paperSizes = ['a4', 'thermal80'] as PrintProvider['paperSizes'];
  readonly permissions = ['sales.manage'];

  constructor(
    private readonly invoices: SalesInvoicesService,
    @Inject(SALES_ORDER_REPOSITORY) private readonly orders: SalesOrderRepository,
    @Inject(CUSTOMER_REPOSITORY) private readonly customers: CustomerRepository,
    @Inject(PAYMENT_ALLOCATION_REPOSITORY) private readonly allocations: PaymentAllocationRepository,
  ) {}

  async build(db: Kysely<TenantDatabase>, id: string): Promise<PrintDocumentBody> {
    const invoice = await this.invoices.getById(db, id);
    const order = await this.orders.findById(db, invoice.salesOrderId);
    const customer = order ? await this.customers.findById(db, order.customerId) : null;
    const currency = invoice.totalAmount.currency;
    const paid =
      invoice.status === 'posted'
        ? ((await this.allocations.sumAllocatedAmountBySalesInvoiceIds(db, [id]))[id] ?? Money.zero(currency))
        : null;
    const labels = await readPrintLabels(
      db,
      invoice.lines.map((line) => line.productVariantId),
      invoice.lines.map((line) => line.unitOfMeasureId),
    );
    return {
      id: invoice.id,
      title: invoice.vatAmount.isZero() ? 'فاتورة بيع' : 'فاتورة ضريبية',
      number: invoice.invoiceNumber,
      status: invoice.status,
      statusLabel: statusLabel(invoice.status),
      date: invoice.invoiceDate ?? localIsoDate(invoice.createdAt),
      dueDate: invoice.dueDate,
      currency,
      party: customer ? customerParty(customer) : null,
      fields: [
        ...(order ? [{ label: 'أمر البيع', value: order.soNumber }] : []),
        ...(invoice.pricesIncludeTax ? [{ label: 'الأسعار', value: 'شاملة الضريبة' }] : []),
      ],
      lines: invoice.lines.map((line) => {
        const label = labels.variant(line.productVariantId);
        return {
          description: label.name,
          sku: label.sku,
          details: line.notes,
          quantity: line.quantityInvoiced,
          unit: labels.unit(line.unitOfMeasureId, line.productVariantId),
          unitPrice: moneyDto(line.unitPrice),
          amount: moneyDto(line.netAmount),
          taxes: lineTaxesDto(line.taxes, currency),
        };
      }),
      totals: documentTotalsDto(invoice, { paid }),
      notes: invoice.notes,
    };
  }
}

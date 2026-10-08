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
import { PurchaseInvoicesService } from '../../application/services/purchase-invoices.service';
import { PURCHASE_ORDER_REPOSITORY, type PurchaseOrderRepository } from '../../application/ports/purchase-order.repository';
import { SUPPLIER_REPOSITORY, type SupplierRepository } from '../../application/ports/supplier.repository';
import {
  SUPPLIER_PAYMENT_ALLOCATION_REPOSITORY,
  type SupplierPaymentAllocationRepository,
} from '../../application/ports/supplier-payment-allocation.repository';
import { supplierParty } from './purchases-print-shared';

/** فاتورة مشتريات — mirror of the sales invoice; paid / remaining come from posted supplier payments. */
@Injectable()
export class PurchaseInvoicePrintProvider implements PrintProvider {
  readonly documentType = 'purchase_invoice';
  readonly label = 'فاتورة مشتريات';
  readonly paperSizes = ['a4'] as PrintProvider['paperSizes'];
  readonly permissions = ['purchases.manage'];

  constructor(
    private readonly invoices: PurchaseInvoicesService,
    @Inject(PURCHASE_ORDER_REPOSITORY) private readonly orders: PurchaseOrderRepository,
    @Inject(SUPPLIER_REPOSITORY) private readonly suppliers: SupplierRepository,
    @Inject(SUPPLIER_PAYMENT_ALLOCATION_REPOSITORY) private readonly allocations: SupplierPaymentAllocationRepository,
  ) {}

  async build(db: Kysely<TenantDatabase>, id: string): Promise<PrintDocumentBody> {
    const invoice = await this.invoices.getById(db, id);
    const order = await this.orders.findById(db, invoice.purchaseOrderId);
    const supplier = order ? await this.suppliers.findById(db, order.supplierId) : null;
    const currency = invoice.totalAmount.currency;
    const paid =
      invoice.status === 'posted'
        ? ((await this.allocations.sumAllocatedAmountByPurchaseInvoiceIds(db, [id]))[id] ?? Money.zero(currency))
        : null;
    const labels = await readPrintLabels(
      db,
      invoice.lines.map((line) => line.productVariantId),
      invoice.lines.map((line) => line.unitOfMeasureId),
    );
    return {
      id: invoice.id,
      title: 'فاتورة مشتريات',
      number: invoice.invoiceNumber,
      status: invoice.status,
      statusLabel: statusLabel(invoice.status),
      date: invoice.invoiceDate ?? localIsoDate(invoice.createdAt),
      dueDate: invoice.dueDate,
      currency,
      party: supplier ? supplierParty(supplier) : null,
      fields: [
        ...(order ? [{ label: 'أمر الشراء', value: order.poNumber }] : []),
        ...(invoice.supplierInvoiceNumber ? [{ label: 'رقم فاتورة المورد', value: invoice.supplierInvoiceNumber }] : []),
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

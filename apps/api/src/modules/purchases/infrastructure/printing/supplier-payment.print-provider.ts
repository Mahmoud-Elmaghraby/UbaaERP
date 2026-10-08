import { localIsoDate } from '../../../../shared/time/local-date';
import { Inject, Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import type { PrintDocumentBody, PrintProvider } from '../../../../shared/printing/print-provider';
import {
  allocationLinesDto,
  amountTotalsDto,
  paymentMethodLabel,
  readTreasuryName,
  statusLabel,
} from '../../../../shared/printing/print-helpers';
import { SupplierPaymentsService } from '../../application/services/supplier-payments.service';
import {
  PURCHASE_INVOICE_REPOSITORY,
  type PurchaseInvoiceRepository,
} from '../../application/ports/purchase-invoice.repository';
import { SUPPLIER_REPOSITORY, type SupplierRepository } from '../../application/ports/supplier.repository';
import { supplierParty } from './purchases-print-shared';

/** سند صرف — one row per purchase invoice it settles, plus any on-account remainder. A4 or the 80 mm roll. */
@Injectable()
export class SupplierPaymentPrintProvider implements PrintProvider {
  readonly documentType = 'supplier_payment';
  readonly label = 'سند صرف';
  readonly paperSizes = ['a4', 'thermal80'] as PrintProvider['paperSizes'];
  readonly permissions = ['purchases.manage'];

  constructor(
    private readonly payments: SupplierPaymentsService,
    @Inject(PURCHASE_INVOICE_REPOSITORY) private readonly invoices: PurchaseInvoiceRepository,
    @Inject(SUPPLIER_REPOSITORY) private readonly suppliers: SupplierRepository,
  ) {}

  async build(db: Kysely<TenantDatabase>, id: string): Promise<PrintDocumentBody> {
    const payment = await this.payments.getById(db, id);
    const [supplier, invoices, treasuryName] = await Promise.all([
      this.suppliers.findById(db, payment.supplierId),
      Promise.all(payment.allocations.map((allocation) => this.invoices.findById(db, allocation.purchaseInvoiceId))),
      payment.treasuryId ? readTreasuryName(db, payment.treasuryId) : null,
    ]);
    return {
      id: payment.id,
      title: 'سند صرف',
      number: payment.paymentNumber,
      status: payment.status,
      statusLabel: statusLabel(payment.status),
      date: payment.paymentDate ?? localIsoDate(payment.createdAt),
      currency: payment.amount.currency,
      party: supplier ? supplierParty(supplier) : null,
      fields: [
        { label: 'طريقة الدفع', value: paymentMethodLabel(payment.paymentMethod) },
        ...(payment.referenceNumber ? [{ label: 'رقم المرجع', value: payment.referenceNumber }] : []),
        ...(treasuryName ? [{ label: 'الخزينة', value: treasuryName }] : []),
      ],
      lines: allocationLinesDto(
        payment.allocations.map((allocation, index) => {
          const invoice = invoices[index];
          return {
            invoiceNumber: invoice
              ? invoice.invoiceNumber + (invoice.supplierInvoiceNumber ? ` (${invoice.supplierInvoiceNumber})` : '')
              : '—',
            amount: allocation.allocatedAmount,
          };
        }),
        payment.unallocatedAmount,
      ),
      totals: amountTotalsDto(payment.amount),
      notes: payment.notes,
    };
  }
}

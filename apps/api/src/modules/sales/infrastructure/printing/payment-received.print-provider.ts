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
import { PaymentsReceivedService } from '../../application/services/payments-received.service';
import { SALES_INVOICE_REPOSITORY, type SalesInvoiceRepository } from '../../application/ports/sales-invoice.repository';
import { CUSTOMER_REPOSITORY, type CustomerRepository } from '../../application/ports/customer.repository';
import { customerParty } from './sales-print-shared';

/** سند قبض — one row per invoice it settles, plus any on-account remainder. A4 or the 80 mm roll. */
@Injectable()
export class PaymentReceivedPrintProvider implements PrintProvider {
  readonly documentType = 'payment_received';
  readonly label = 'إيصال استلام نقدية';
  readonly paperSizes = ['a4', 'thermal80'] as PrintProvider['paperSizes'];
  readonly permissions = ['sales.manage'];

  constructor(
    private readonly payments: PaymentsReceivedService,
    @Inject(SALES_INVOICE_REPOSITORY) private readonly invoices: SalesInvoiceRepository,
    @Inject(CUSTOMER_REPOSITORY) private readonly customers: CustomerRepository,
  ) {}

  async build(db: Kysely<TenantDatabase>, id: string): Promise<PrintDocumentBody> {
    const payment = await this.payments.getById(db, id);
    const [customer, invoices, treasuryName] = await Promise.all([
      this.customers.findById(db, payment.customerId),
      Promise.all(payment.allocations.map((allocation) => this.invoices.findById(db, allocation.salesInvoiceId))),
      payment.treasuryId ? readTreasuryName(db, payment.treasuryId) : null,
    ]);
    return {
      id: payment.id,
      title: 'إيصال استلام نقدية',
      number: payment.paymentNumber,
      status: payment.status,
      statusLabel: statusLabel(payment.status),
      date: payment.paymentDate ?? localIsoDate(payment.createdAt),
      currency: payment.amount.currency,
      party: customer ? customerParty(customer) : null,
      fields: [
        { label: 'طريقة الدفع', value: paymentMethodLabel(payment.paymentMethod) },
        ...(payment.referenceNumber ? [{ label: 'رقم المرجع', value: payment.referenceNumber }] : []),
        ...(treasuryName ? [{ label: 'الخزينة', value: treasuryName }] : []),
      ],
      lines: allocationLinesDto(
        payment.allocations.map((allocation, index) => ({
          invoiceNumber: invoices[index]?.invoiceNumber ?? '—',
          amount: allocation.allocatedAmount,
        })),
        payment.unallocatedAmount,
      ),
      totals: amountTotalsDto(payment.amount),
      notes: payment.notes,
    };
  }
}

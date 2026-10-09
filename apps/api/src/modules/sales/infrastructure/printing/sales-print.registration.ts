import { Injectable, type OnModuleInit } from '@nestjs/common';
import { PrintRegistry } from '../../../../shared/printing/print-registry';
import { PartyStatementPrintProvider } from '../../../../shared/statements/party-statement.print-provider';
import { CustomerLedgerSource } from '../statements/customer-ledger.source';
import { SalesInvoicePrintProvider } from './sales-invoice.print-provider';
import { SalesCreditNotePrintProvider } from './sales-credit-note.print-provider';
import { SalesReturnPrintProvider } from './sales-return.print-provider';
import { PaymentReceivedPrintProvider } from './payment-received.print-provider';
import { QuotationPrintProvider } from './quotation.print-provider';
import { SalesOrderPrintProvider } from './sales-order.print-provider';
import { DeliveryPrintProvider } from './delivery.print-provider';

/** Registers Sales' printable documents with the central print service. */
@Injectable()
export class SalesPrintRegistration implements OnModuleInit {
  constructor(
    private readonly registry: PrintRegistry,
    private readonly customerLedger: CustomerLedgerSource,
    private readonly salesInvoice: SalesInvoicePrintProvider,
    private readonly salesCreditNote: SalesCreditNotePrintProvider,
    private readonly paymentReceived: PaymentReceivedPrintProvider,
    private readonly quotation: QuotationPrintProvider,
    private readonly salesOrder: SalesOrderPrintProvider,
    private readonly delivery: DeliveryPrintProvider,
    private readonly salesReturn: SalesReturnPrintProvider,
  ) {}

  onModuleInit(): void {
    this.registry.register(
      new PartyStatementPrintProvider(this.customerLedger, 'customer_statement', 'كشف حساب عميل', ['sales.manage']),
      this.quotation,
      this.salesOrder,
      this.delivery,
      this.salesInvoice,
      this.salesReturn,
      this.salesCreditNote,
      this.paymentReceived,
    );
  }
}

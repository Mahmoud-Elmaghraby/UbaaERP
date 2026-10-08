import { Injectable, type OnModuleInit } from '@nestjs/common';
import { PrintRegistry } from '../../../../shared/printing/print-registry';
import { SalesInvoicePrintProvider } from './sales-invoice.print-provider';

/** Registers Sales' printable documents with the central print service. */
@Injectable()
export class SalesPrintRegistration implements OnModuleInit {
  constructor(
    private readonly registry: PrintRegistry,
    private readonly salesInvoice: SalesInvoicePrintProvider,
  ) {}

  onModuleInit(): void {
    this.registry.register(this.salesInvoice);
  }
}

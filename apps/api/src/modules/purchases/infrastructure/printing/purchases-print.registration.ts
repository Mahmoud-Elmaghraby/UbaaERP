import { Injectable, type OnModuleInit } from '@nestjs/common';
import { PrintRegistry } from '../../../../shared/printing/print-registry';
import { PurchaseOrderPrintProvider } from './purchase-order.print-provider';
import { GoodsReceiptPrintProvider } from './goods-receipt.print-provider';
import { PurchaseInvoicePrintProvider } from './purchase-invoice.print-provider';
import { SupplierPaymentPrintProvider } from './supplier-payment.print-provider';

/** Registers Purchases' printable documents with the central print service. */
@Injectable()
export class PurchasesPrintRegistration implements OnModuleInit {
  constructor(
    private readonly registry: PrintRegistry,
    private readonly purchaseOrder: PurchaseOrderPrintProvider,
    private readonly goodsReceipt: GoodsReceiptPrintProvider,
    private readonly purchaseInvoice: PurchaseInvoicePrintProvider,
    private readonly supplierPayment: SupplierPaymentPrintProvider,
  ) {}

  onModuleInit(): void {
    this.registry.register(this.purchaseOrder, this.goodsReceipt, this.purchaseInvoice, this.supplierPayment);
  }
}

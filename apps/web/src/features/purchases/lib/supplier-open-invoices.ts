import type { SupplierOutstandingInvoiceDto } from '@erp-platform/contracts';

import type { OpenInvoiceRow } from '../../../components/document/open-invoices-allocation';

const DAY_MS = 86_400_000;

/** Supplier outstanding invoices (in `currency`) in the shared allocation table's shape. */
export function toSupplierOpenRows(invoices: readonly SupplierOutstandingInvoiceDto[], currency: string): OpenInvoiceRow[] {
  const today = new Date(new Date().toISOString().slice(0, 10)).getTime();
  return invoices
    .filter((invoice) => invoice.outstandingAmount.currency === currency && BigInt(invoice.outstandingAmount.amountMinorUnits) > 0n)
    .map((invoice) => ({
      id: invoice.purchaseInvoiceId,
      number: invoice.supplierInvoiceNumber ? `${invoice.invoiceNumber} · ${invoice.supplierInvoiceNumber}` : invoice.invoiceNumber,
      invoiceDate: invoice.invoiceDate,
      dueDate: invoice.dueDate,
      overdueDays: invoice.dueDate ? Math.max(0, Math.floor((today - new Date(invoice.dueDate).getTime()) / DAY_MS)) : 0,
      totalMinorUnits: invoice.totalAmount.amountMinorUnits,
      outstandingMinorUnits: invoice.outstandingAmount.amountMinorUnits,
      href: `/purchases/purchase-invoices/${invoice.purchaseInvoiceId}`,
    }));
}

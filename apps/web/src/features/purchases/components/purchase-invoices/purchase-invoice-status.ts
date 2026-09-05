import type { PurchaseInvoiceStatusDto } from '@erp-platform/contracts';

export const PURCHASE_INVOICE_STATUS_VARIANT: Record<
  PurchaseInvoiceStatusDto,
  'default' | 'secondary' | 'destructive' | 'outline'
> = {
  draft: 'secondary',
  posted: 'default',
  cancelled: 'destructive',
};

export function purchaseInvoiceStatusLabelKey(status: PurchaseInvoiceStatusDto): string {
  return `purchases.purchaseInvoices.status.${status}`;
}

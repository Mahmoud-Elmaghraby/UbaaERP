import type { SalesInvoiceStatusDto } from '@erp-platform/contracts';

export const SALES_INVOICE_STATUS_VARIANT: Record<
  SalesInvoiceStatusDto,
  'default' | 'secondary' | 'destructive' | 'outline'
> = {
  draft: 'secondary',
  posted: 'default',
  cancelled: 'destructive',
};

export function salesInvoiceStatusLabelKey(status: SalesInvoiceStatusDto): string {
  return `sales.salesInvoices.status.${status}`;
}

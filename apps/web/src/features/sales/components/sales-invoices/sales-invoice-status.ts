import type { SalesInvoiceStatusDto } from '@erp-platform/contracts';
import type { BadgeProps } from '@erp-platform/ui';

/** Standard document-status colors (claude/ui-redesign-plan.md): draft → neutral,
 * posted → info, cancelled → danger. */
export const SALES_INVOICE_STATUS_VARIANT: Record<
  SalesInvoiceStatusDto,
  NonNullable<BadgeProps['variant']>
> = {
  draft: 'neutral',
  posted: 'info',
  cancelled: 'danger',
};

export function salesInvoiceStatusLabelKey(status: SalesInvoiceStatusDto): string {
  return `sales.salesInvoices.status.${status}`;
}

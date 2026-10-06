import type { PurchaseInvoiceStatusDto } from '@erp-platform/contracts';
import type { BadgeProps } from '@erp-platform/ui';

/** Standard document-status colors (claude/ui-redesign-plan.md): draft → neutral,
 * posted → info, cancelled → danger. */
export const PURCHASE_INVOICE_STATUS_VARIANT: Record<
  PurchaseInvoiceStatusDto,
  NonNullable<BadgeProps['variant']>
> = {
  draft: 'neutral',
  posted: 'info',
  cancelled: 'danger',
};

export function purchaseInvoiceStatusLabelKey(status: PurchaseInvoiceStatusDto): string {
  return `purchases.purchaseInvoices.status.${status}`;
}

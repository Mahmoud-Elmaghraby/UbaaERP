import type { BadgeProps } from '@erp-platform/ui';
import type { PurchaseOrderStatusDto } from '@erp-platform/contracts';

export const PURCHASE_ORDER_STATUS_VARIANT: Record<
  PurchaseOrderStatusDto,
  NonNullable<BadgeProps['variant']>
> = {
  draft: 'neutral',
  confirmed: 'info',
  partially_received: 'warning',
  fully_received: 'success',
  cancelled: 'danger',
};

export function purchaseOrderStatusLabelKey(status: PurchaseOrderStatusDto): string {
  return `purchases.purchaseOrders.status.${status}`;
}

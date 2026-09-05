import type { PurchaseOrderStatusDto } from '@erp-platform/contracts';

export const PURCHASE_ORDER_STATUS_VARIANT: Record<
  PurchaseOrderStatusDto,
  'default' | 'secondary' | 'destructive' | 'outline'
> = {
  draft: 'secondary',
  confirmed: 'outline',
  partially_received: 'outline',
  fully_received: 'default',
  cancelled: 'destructive',
};

export function purchaseOrderStatusLabelKey(status: PurchaseOrderStatusDto): string {
  return `purchases.purchaseOrders.status.${status}`;
}

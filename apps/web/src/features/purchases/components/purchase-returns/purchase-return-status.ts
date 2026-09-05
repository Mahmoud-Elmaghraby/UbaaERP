import type { PurchaseReturnStatusDto } from '@erp-platform/contracts';

export const PURCHASE_RETURN_STATUS_VARIANT: Record<
  PurchaseReturnStatusDto,
  'default' | 'secondary' | 'destructive' | 'outline'
> = {
  draft: 'secondary',
  confirmed: 'default',
  cancelled: 'destructive',
};

export function purchaseReturnStatusLabelKey(status: PurchaseReturnStatusDto): string {
  return `purchases.purchaseReturns.status.${status}`;
}

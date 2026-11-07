import type { BadgeProps } from '@erp-platform/ui';
import type { PurchaseReturnStatusDto } from '@erp-platform/contracts';

export const PURCHASE_RETURN_STATUS_VARIANT: Record<
  PurchaseReturnStatusDto,
  NonNullable<BadgeProps['variant']>
> = {
  draft: 'neutral',
  confirmed: 'info',
  cancelled: 'danger',
};

export function purchaseReturnStatusLabelKey(status: PurchaseReturnStatusDto): string {
  return `purchases.purchaseReturns.status.${status}`;
}

export const PURCHASE_RETURNS_PATH = '/purchases/purchase-returns';

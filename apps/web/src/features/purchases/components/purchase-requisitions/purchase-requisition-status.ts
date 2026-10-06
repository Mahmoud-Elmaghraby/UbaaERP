import type { BadgeProps } from '@erp-platform/ui';
import type { PurchaseRequisitionStatusDto } from '@erp-platform/contracts';

/** Shared between the list column and the details view so both render the same badge. */
export const PURCHASE_REQUISITION_STATUS_VARIANT: Record<
  PurchaseRequisitionStatusDto,
  NonNullable<BadgeProps['variant']>
> = {
  draft: 'neutral',
  submitted: 'info',
  approved: 'success',
  rejected: 'danger',
  cancelled: 'danger',
};

export function purchaseRequisitionStatusLabelKey(status: PurchaseRequisitionStatusDto): string {
  return `purchases.purchaseRequisitions.status.${status}`;
}

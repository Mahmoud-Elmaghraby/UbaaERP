import type { PurchaseRequisitionStatusDto } from '@erp-platform/contracts';

/** Shared between the list column and the details view so both render the same badge. */
export const PURCHASE_REQUISITION_STATUS_VARIANT: Record<
  PurchaseRequisitionStatusDto,
  'default' | 'secondary' | 'destructive' | 'outline'
> = {
  draft: 'secondary',
  submitted: 'outline',
  approved: 'default',
  rejected: 'destructive',
  cancelled: 'secondary',
};

export function purchaseRequisitionStatusLabelKey(status: PurchaseRequisitionStatusDto): string {
  return `purchases.purchaseRequisitions.status.${status}`;
}

import type { BadgeProps } from '@erp-platform/ui';
import type { SupplierPaymentStatusDto } from '@erp-platform/contracts';

export const SUPPLIER_PAYMENT_STATUS_VARIANT: Record<SupplierPaymentStatusDto, NonNullable<BadgeProps['variant']>> = {
  draft: 'neutral',
  posted: 'info',
  cancelled: 'danger',
};

export function supplierPaymentStatusLabelKey(status: SupplierPaymentStatusDto): string {
  return `purchases.supplierPayments.status.${status}`;
}

import type { BadgeProps } from '@erp-platform/ui';
import type { SupplierQuotationStatusDto } from '@erp-platform/contracts';

export const QUOTATION_STATUS_VARIANT: Record<
  SupplierQuotationStatusDto,
  NonNullable<BadgeProps['variant']>
> = {
  received: 'info',
  selected: 'success',
  rejected: 'danger',
};

export function quotationStatusLabelKey(status: SupplierQuotationStatusDto): string {
  return `purchases.rfqs.quotationStatus.${status}`;
}

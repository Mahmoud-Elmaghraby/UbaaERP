import type { BadgeProps } from '@erp-platform/ui';
import type { QuotationStatusDto } from '@erp-platform/contracts';

export const QUOTATION_STATUS_VARIANT: Record<QuotationStatusDto, NonNullable<BadgeProps['variant']>> = {
  draft: 'neutral',
  sent: 'info',
  accepted: 'success',
  rejected: 'danger',
  cancelled: 'danger',
};

export function quotationStatusLabelKey(status: QuotationStatusDto): string {
  return `sales.quotations.status.${status}`;
}

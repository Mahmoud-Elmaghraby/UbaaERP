import type { BadgeProps } from '@erp-platform/ui';
import type { SalesReturnStatusDto } from '@erp-platform/contracts';

export const SALES_RETURN_STATUS_VARIANT: Record<SalesReturnStatusDto, NonNullable<BadgeProps['variant']>> = {
  draft: 'neutral',
  confirmed: 'info',
  cancelled: 'danger',
};

export function salesReturnStatusLabelKey(status: SalesReturnStatusDto): string {
  return `sales.salesReturns.status.${status}`;
}

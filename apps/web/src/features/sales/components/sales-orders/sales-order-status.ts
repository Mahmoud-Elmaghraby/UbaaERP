import type { BadgeProps } from '@erp-platform/ui';
import type { SalesOrderStatusDto } from '@erp-platform/contracts';

export const SALES_ORDER_STATUS_VARIANT: Record<SalesOrderStatusDto, NonNullable<BadgeProps['variant']>> = {
  draft: 'neutral',
  confirmed: 'info',
  partially_delivered: 'warning',
  fully_delivered: 'success',
  cancelled: 'danger',
};

export function salesOrderStatusLabelKey(status: SalesOrderStatusDto): string {
  return `sales.salesOrders.status.${status}`;
}

import type { SalesOrderStatusDto } from '@erp-platform/contracts';

export const SALES_ORDER_STATUS_VARIANT: Record<
  SalesOrderStatusDto,
  'default' | 'secondary' | 'destructive' | 'outline'
> = {
  draft: 'secondary',
  confirmed: 'outline',
  partially_delivered: 'outline',
  fully_delivered: 'default',
  cancelled: 'destructive',
};

export function salesOrderStatusLabelKey(status: SalesOrderStatusDto): string {
  return `sales.salesOrders.status.${status}`;
}

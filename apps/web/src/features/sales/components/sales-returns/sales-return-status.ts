import type { SalesReturnStatusDto } from '@erp-platform/contracts';

export const SALES_RETURN_STATUS_VARIANT: Record<
  SalesReturnStatusDto,
  'default' | 'secondary' | 'destructive' | 'outline'
> = {
  draft: 'secondary',
  confirmed: 'default',
  cancelled: 'destructive',
};

export function salesReturnStatusLabelKey(status: SalesReturnStatusDto): string {
  return `sales.salesReturns.status.${status}`;
}

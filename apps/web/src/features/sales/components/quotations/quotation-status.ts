import type { QuotationStatusDto } from '@erp-platform/contracts';

export const QUOTATION_STATUS_VARIANT: Record<
  QuotationStatusDto,
  'default' | 'secondary' | 'destructive' | 'outline'
> = {
  draft: 'secondary',
  sent: 'outline',
  accepted: 'default',
  rejected: 'destructive',
  cancelled: 'destructive',
};

export function quotationStatusLabelKey(status: QuotationStatusDto): string {
  return `sales.quotations.status.${status}`;
}

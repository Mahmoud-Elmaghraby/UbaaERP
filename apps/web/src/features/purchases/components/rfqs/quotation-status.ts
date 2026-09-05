import type { SupplierQuotationStatusDto } from '@erp-platform/contracts';

export const QUOTATION_STATUS_VARIANT: Record<
  SupplierQuotationStatusDto,
  'default' | 'secondary' | 'destructive' | 'outline'
> = {
  received: 'outline',
  selected: 'default',
  rejected: 'destructive',
};

export function quotationStatusLabelKey(status: SupplierQuotationStatusDto): string {
  return `purchases.rfqs.quotationStatus.${status}`;
}

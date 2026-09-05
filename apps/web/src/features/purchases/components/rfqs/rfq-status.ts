import type { RfqStatusDto } from '@erp-platform/contracts';

export const RFQ_STATUS_VARIANT: Record<RfqStatusDto, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  draft: 'secondary',
  sent: 'outline',
  closed: 'default',
  cancelled: 'secondary',
};

export function rfqStatusLabelKey(status: RfqStatusDto): string {
  return `purchases.rfqs.status.${status}`;
}

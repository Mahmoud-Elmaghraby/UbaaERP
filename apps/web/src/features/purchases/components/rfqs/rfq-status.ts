import type { BadgeProps } from '@erp-platform/ui';
import type { RfqStatusDto } from '@erp-platform/contracts';

export const RFQ_STATUS_VARIANT: Record<RfqStatusDto, NonNullable<BadgeProps['variant']>> = {
  draft: 'neutral',
  sent: 'info',
  closed: 'neutral',
  cancelled: 'danger',
};

export function rfqStatusLabelKey(status: RfqStatusDto): string {
  return `purchases.rfqs.status.${status}`;
}

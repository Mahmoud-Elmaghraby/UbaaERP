import type { BadgeProps } from '@erp-platform/ui';
import type { DeliveryStatusDto } from '@erp-platform/contracts';

export const DELIVERIES_PATH = '/sales/deliveries';

export const DELIVERY_STATUS_VARIANT: Record<DeliveryStatusDto, NonNullable<BadgeProps['variant']>> = {
  draft: 'neutral',
  confirmed: 'info',
  cancelled: 'danger',
};

export function deliveryStatusLabelKey(status: DeliveryStatusDto): string {
  return `sales.deliveries.status.${status}`;
}

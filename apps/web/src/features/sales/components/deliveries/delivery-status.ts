import type { DeliveryStatusDto } from '@erp-platform/contracts';

export const DELIVERY_STATUS_VARIANT: Record<
  DeliveryStatusDto,
  'default' | 'secondary' | 'destructive' | 'outline'
> = {
  draft: 'secondary',
  confirmed: 'default',
  cancelled: 'destructive',
};

export function deliveryStatusLabelKey(status: DeliveryStatusDto): string {
  return `sales.deliveries.status.${status}`;
}

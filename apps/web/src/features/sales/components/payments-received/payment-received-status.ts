import type { BadgeProps } from '@erp-platform/ui';
import type { PaymentReceivedStatusDto } from '@erp-platform/contracts';

export const PAYMENT_RECEIVED_STATUS_VARIANT: Record<
  PaymentReceivedStatusDto,
  NonNullable<BadgeProps['variant']>
> = {
  draft: 'neutral',
  posted: 'info',
  cancelled: 'danger',
  bounced: 'warning',
};

export function paymentReceivedStatusLabelKey(status: PaymentReceivedStatusDto): string {
  return `sales.paymentsReceived.status.${status}`;
}

export const PAYMENTS_RECEIVED_PATH = '/sales/payments-received';

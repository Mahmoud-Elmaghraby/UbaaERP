import type { PaymentReceivedStatusDto } from '@erp-platform/contracts';

export const PAYMENT_RECEIVED_STATUS_VARIANT: Record<
  PaymentReceivedStatusDto,
  'default' | 'secondary' | 'destructive' | 'outline'
> = {
  draft: 'secondary',
  posted: 'default',
  cancelled: 'destructive',
};

export function paymentReceivedStatusLabelKey(status: PaymentReceivedStatusDto): string {
  return `sales.paymentsReceived.status.${status}`;
}

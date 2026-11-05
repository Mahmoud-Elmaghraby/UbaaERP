import type { BadgeProps } from '@erp-platform/ui';
import type { QuotationStatusDto } from '@erp-platform/contracts';

export const QUOTATION_STATUS_VARIANT: Record<QuotationStatusDto, NonNullable<BadgeProps['variant']>> = {
  draft: 'neutral',
  sent: 'info',
  accepted: 'success',
  rejected: 'danger',
  cancelled: 'danger',
};

export function quotationStatusLabelKey(status: QuotationStatusDto): string {
  return `sales.quotations.status.${status}`;
}

export const QUOTATIONS_PATH = '/sales/quotations';

/** A quotation still open (draft/sent) whose valid-until date has passed. */
export function isQuotationExpired(
  quotation: { status: QuotationStatusDto; validUntilDate: string | null },
  today: string,
): boolean {
  return (
    (quotation.status === 'draft' || quotation.status === 'sent') &&
    Boolean(quotation.validUntilDate) &&
    quotation.validUntilDate! < today
  );
}

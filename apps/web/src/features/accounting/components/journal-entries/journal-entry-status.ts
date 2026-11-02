import type { BadgeProps } from '@erp-platform/ui';
import type { JournalEntryStatus } from '@erp-platform/contracts';

export const JOURNAL_ENTRY_STATUS_VARIANT: Record<JournalEntryStatus, NonNullable<BadgeProps['variant']>> = {
  draft: 'neutral',
  posted: 'info',
  cancelled: 'danger',
};

export function journalEntryStatusLabelKey(status: JournalEntryStatus): string {
  return `accounting.journalEntries.status.${status}`;
}

/** 'payment_fx:<invoiceId>' → 'payment_fx' — the label key of a source reference type. */
export function sourceRefKey(type: string): string {
  return type.split(':')[0]!;
}

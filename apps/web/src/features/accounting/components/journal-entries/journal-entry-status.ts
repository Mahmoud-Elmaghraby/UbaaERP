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

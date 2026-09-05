import type { JournalEntryStatus } from '@erp-platform/contracts';

export const JOURNAL_ENTRY_STATUS_VARIANT: Record<
  JournalEntryStatus,
  'default' | 'secondary' | 'destructive' | 'outline'
> = {
  draft: 'secondary',
  posted: 'default',
  cancelled: 'destructive',
};

export function journalEntryStatusLabelKey(status: JournalEntryStatus): string {
  return `accounting.journalEntries.status.${status}`;
}

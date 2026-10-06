import { useTranslation } from 'react-i18next';

import { JournalEntriesTab } from './journal-entries-tab';
import { PageHeader } from '@erp-platform/ui';

export function JournalEntriesPage() {
  const { t } = useTranslation();
  return (
    <div className="grid gap-6">
      <PageHeader
        title={t('accounting.tabs.journalEntries')}
        description={t('accounting.journalEntries.subtitle')}
      />
      <JournalEntriesTab />
    </div>
  );
}

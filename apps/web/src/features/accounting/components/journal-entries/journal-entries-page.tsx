import { useTranslation } from 'react-i18next';

import { JournalEntriesTab } from './journal-entries-tab';

export function JournalEntriesPage() {
  const { t } = useTranslation();
  return (
    <div className="grid gap-6">
      <h1 className="text-2xl font-semibold">{t('accounting.tabs.journalEntries')}</h1>
      <JournalEntriesTab />
    </div>
  );
}

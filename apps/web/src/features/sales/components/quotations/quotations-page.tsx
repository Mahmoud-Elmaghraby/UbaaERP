import { useTranslation } from 'react-i18next';

import { QuotationsTab } from './quotations-tab';

export function QuotationsPage() {
  const { t } = useTranslation();
  return (
    <div className="grid gap-6">
      <h1 className="text-2xl font-semibold">{t('sales.tabs.quotations')}</h1>
      <QuotationsTab />
    </div>
  );
}

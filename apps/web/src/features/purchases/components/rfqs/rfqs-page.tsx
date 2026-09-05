import { useTranslation } from 'react-i18next';

import { RfqsTab } from './rfqs-tab';

export function RfqsPage() {
  const { t } = useTranslation();
  return (
    <div className="grid gap-6">
      <h1 className="text-2xl font-semibold">{t('purchases.tabs.rfqs')}</h1>
      <RfqsTab />
    </div>
  );
}

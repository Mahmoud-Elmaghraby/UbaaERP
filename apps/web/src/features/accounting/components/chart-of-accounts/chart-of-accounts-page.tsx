import { useTranslation } from 'react-i18next';

import { ChartOfAccountsTab } from './chart-of-accounts-tab';

export function ChartOfAccountsPage() {
  const { t } = useTranslation();
  return (
    <div className="grid gap-6">
      <h1 className="text-2xl font-semibold">{t('accounting.tabs.chartOfAccounts')}</h1>
      <ChartOfAccountsTab />
    </div>
  );
}

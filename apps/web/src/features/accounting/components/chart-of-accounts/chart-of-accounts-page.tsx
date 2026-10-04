import { useTranslation } from 'react-i18next';

import { ChartOfAccountsTab } from './chart-of-accounts-tab';
import { PageHeader } from '@erp-platform/ui';

export function ChartOfAccountsPage() {
  const { t } = useTranslation();
  return (
    <div className="grid gap-6">
      <PageHeader title={t('accounting.tabs.chartOfAccounts')} />
      <ChartOfAccountsTab />
    </div>
  );
}

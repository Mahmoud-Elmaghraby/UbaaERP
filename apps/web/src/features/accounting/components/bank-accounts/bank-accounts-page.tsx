import { useTranslation } from 'react-i18next';

import { BankAccountsTab } from './bank-accounts-tab';
import { PageHeader } from '@erp-platform/ui';

export function BankAccountsPage() {
  const { t } = useTranslation();
  return (
    <div className="grid gap-6">
      <PageHeader
        title={t('accounting.tabs.bankAccounts')}
        description={t('accounting.bankAccounts.subtitle')}
      />
      <BankAccountsTab />
    </div>
  );
}

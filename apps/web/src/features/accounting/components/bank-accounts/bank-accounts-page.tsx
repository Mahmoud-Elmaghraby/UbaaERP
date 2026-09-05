import { useTranslation } from 'react-i18next';

import { BankAccountsTab } from './bank-accounts-tab';

export function BankAccountsPage() {
  const { t } = useTranslation();
  return (
    <div className="grid gap-6">
      <h1 className="text-2xl font-semibold">{t('accounting.tabs.bankAccounts')}</h1>
      <BankAccountsTab />
    </div>
  );
}

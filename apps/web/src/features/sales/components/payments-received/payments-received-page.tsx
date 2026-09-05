import { useTranslation } from 'react-i18next';

import { PaymentsReceivedTab } from './payments-received-tab';

export function PaymentsReceivedPage() {
  const { t } = useTranslation();
  return (
    <div className="grid gap-6">
      <h1 className="text-2xl font-semibold">{t('sales.tabs.paymentsReceived')}</h1>
      <PaymentsReceivedTab />
    </div>
  );
}

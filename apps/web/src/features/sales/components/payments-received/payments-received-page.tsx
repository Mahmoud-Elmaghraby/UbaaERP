import { useTranslation } from 'react-i18next';

import { PaymentsReceivedTab } from './payments-received-tab';
import { PageHeader } from '@erp-platform/ui';

export function PaymentsReceivedPage() {
  const { t } = useTranslation();
  return (
    <div className="grid gap-6">
      <PageHeader title={t('sales.tabs.paymentsReceived')} />
      <PaymentsReceivedTab />
    </div>
  );
}

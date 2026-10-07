import { useTranslation } from 'react-i18next';
import { PageHeader } from '@erp-platform/ui';

import { SupplierPaymentsTab } from './supplier-payments-tab';

export function SupplierPaymentsPage() {
  const { t } = useTranslation();
  return (
    <div className="grid gap-6">
      <PageHeader title={t('purchases.tabs.supplierPayments')} description={t('purchases.supplierPayments.subtitle')} />
      <SupplierPaymentsTab />
    </div>
  );
}

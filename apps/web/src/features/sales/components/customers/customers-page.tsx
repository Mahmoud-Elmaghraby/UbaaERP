import { useTranslation } from 'react-i18next';

import { CustomersTab } from './customers-tab';
import { PageHeader } from '@erp-platform/ui';

export function CustomersPage() {
  const { t } = useTranslation();
  return (
    <div className="grid gap-6">
      <PageHeader title={t('sales.tabs.customers')} />
      <CustomersTab />
    </div>
  );
}

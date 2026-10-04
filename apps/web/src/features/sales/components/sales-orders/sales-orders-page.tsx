import { useTranslation } from 'react-i18next';

import { SalesOrdersTab } from './sales-orders-tab';
import { PageHeader } from '@erp-platform/ui';

export function SalesOrdersPage() {
  const { t } = useTranslation();
  return (
    <div className="grid gap-6">
      <PageHeader title={t('sales.tabs.salesOrders')} />
      <SalesOrdersTab />
    </div>
  );
}

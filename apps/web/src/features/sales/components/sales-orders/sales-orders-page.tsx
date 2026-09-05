import { useTranslation } from 'react-i18next';

import { SalesOrdersTab } from './sales-orders-tab';

export function SalesOrdersPage() {
  const { t } = useTranslation();
  return (
    <div className="grid gap-6">
      <h1 className="text-2xl font-semibold">{t('sales.tabs.salesOrders')}</h1>
      <SalesOrdersTab />
    </div>
  );
}

import { useTranslation } from 'react-i18next';

import { PurchaseOrdersTab } from './purchase-orders-tab';

export function PurchaseOrdersPage() {
  const { t } = useTranslation();
  return (
    <div className="grid gap-6">
      <h1 className="text-2xl font-semibold">{t('purchases.tabs.purchaseOrders')}</h1>
      <PurchaseOrdersTab />
    </div>
  );
}

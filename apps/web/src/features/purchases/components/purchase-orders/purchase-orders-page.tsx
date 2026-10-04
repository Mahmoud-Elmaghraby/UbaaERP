import { useTranslation } from 'react-i18next';

import { PurchaseOrdersTab } from './purchase-orders-tab';
import { PageHeader } from '@erp-platform/ui';

export function PurchaseOrdersPage() {
  const { t } = useTranslation();
  return (
    <div className="grid gap-6">
      <PageHeader title={t('purchases.tabs.purchaseOrders')} />
      <PurchaseOrdersTab />
    </div>
  );
}

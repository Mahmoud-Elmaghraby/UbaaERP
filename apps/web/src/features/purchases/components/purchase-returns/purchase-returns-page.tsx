import { useTranslation } from 'react-i18next';

import { PurchaseReturnsTab } from './purchase-returns-tab';
import { PageHeader } from '@erp-platform/ui';

export function PurchaseReturnsPage() {
  const { t } = useTranslation();
  return (
    <div className="grid gap-6">
      <PageHeader title={t('purchases.tabs.purchaseReturns')} />
      <PurchaseReturnsTab />
    </div>
  );
}

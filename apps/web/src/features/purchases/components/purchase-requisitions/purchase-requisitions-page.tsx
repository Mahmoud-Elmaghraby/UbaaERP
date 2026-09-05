import { useTranslation } from 'react-i18next';

import { PurchaseRequisitionsTab } from './purchase-requisitions-tab';

export function PurchaseRequisitionsPage() {
  const { t } = useTranslation();
  return (
    <div className="grid gap-6">
      <h1 className="text-2xl font-semibold">{t('purchases.tabs.purchaseRequisitions')}</h1>
      <PurchaseRequisitionsTab />
    </div>
  );
}

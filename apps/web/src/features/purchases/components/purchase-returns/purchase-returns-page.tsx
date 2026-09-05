import { useTranslation } from 'react-i18next';

import { PurchaseReturnsTab } from './purchase-returns-tab';

export function PurchaseReturnsPage() {
  const { t } = useTranslation();
  return (
    <div className="grid gap-6">
      <h1 className="text-2xl font-semibold">{t('purchases.tabs.purchaseReturns')}</h1>
      <PurchaseReturnsTab />
    </div>
  );
}

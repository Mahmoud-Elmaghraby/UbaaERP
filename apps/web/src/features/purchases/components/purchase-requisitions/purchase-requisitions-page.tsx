import { useTranslation } from 'react-i18next';

import { PurchaseRequisitionsTab } from './purchase-requisitions-tab';
import { PageHeader } from '@erp-platform/ui';

export function PurchaseRequisitionsPage() {
  const { t } = useTranslation();
  return (
    <div className="grid gap-6">
      <PageHeader
        title={t('purchases.tabs.purchaseRequisitions')}
        description={t('purchases.purchaseRequisitions.subtitle')}
      />
      <PurchaseRequisitionsTab />
    </div>
  );
}

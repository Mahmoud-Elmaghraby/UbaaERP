import { useTranslation } from 'react-i18next';

import { GoodsReceiptsTab } from './goods-receipts-tab';
import { PageHeader } from '@erp-platform/ui';

export function GoodsReceiptsPage() {
  const { t } = useTranslation();
  return (
    <div className="grid gap-6">
      <PageHeader
        title={t('purchases.tabs.goodsReceipts')}
        description={t('purchases.goodsReceipts.subtitle')}
      />
      <GoodsReceiptsTab />
    </div>
  );
}

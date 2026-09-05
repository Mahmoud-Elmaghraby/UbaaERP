import { useTranslation } from 'react-i18next';

import { GoodsReceiptsTab } from './goods-receipts-tab';

export function GoodsReceiptsPage() {
  const { t } = useTranslation();
  return (
    <div className="grid gap-6">
      <h1 className="text-2xl font-semibold">{t('purchases.tabs.goodsReceipts')}</h1>
      <GoodsReceiptsTab />
    </div>
  );
}

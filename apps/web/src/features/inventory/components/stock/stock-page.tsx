import { useTranslation } from 'react-i18next';

import { StockTab } from './stock-tab';

export function StockPage() {
  const { t } = useTranslation();
  return (
    <div className="grid gap-6">
      <h1 className="text-2xl font-semibold">{t('inventory.tabs.stock')}</h1>
      <StockTab />
    </div>
  );
}

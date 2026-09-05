import { useTranslation } from 'react-i18next';

import { SalesReturnsTab } from './sales-returns-tab';

export function SalesReturnsPage() {
  const { t } = useTranslation();
  return (
    <div className="grid gap-6">
      <h1 className="text-2xl font-semibold">{t('sales.tabs.salesReturns')}</h1>
      <SalesReturnsTab />
    </div>
  );
}

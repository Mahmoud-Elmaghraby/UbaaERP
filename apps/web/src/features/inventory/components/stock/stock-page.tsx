import { useTranslation } from 'react-i18next';

import { StockTab } from './stock-tab';
import { PageHeader } from '@erp-platform/ui';

export function StockPage() {
  const { t } = useTranslation();
  return (
    <div className="grid gap-6">
      <PageHeader title={t('inventory.tabs.stock')} />
      <StockTab />
    </div>
  );
}

import { useTranslation } from 'react-i18next';

import { SalesReturnsTab } from './sales-returns-tab';
import { PageHeader } from '@erp-platform/ui';

export function SalesReturnsPage() {
  const { t } = useTranslation();
  return (
    <div className="grid gap-6">
      <PageHeader title={t('sales.tabs.salesReturns')} />
      <SalesReturnsTab />
    </div>
  );
}

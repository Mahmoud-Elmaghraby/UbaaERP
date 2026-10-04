import { useTranslation } from 'react-i18next';

import { ProductsTab } from './products-tab';
import { PageHeader } from '@erp-platform/ui';

export function ProductsPage() {
  const { t } = useTranslation();
  return (
    <div className="grid gap-6">
      <PageHeader title={t('inventory.tabs.products')} />
      <ProductsTab />
    </div>
  );
}

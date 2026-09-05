import { useTranslation } from 'react-i18next';

import { ProductsTab } from './products-tab';

export function ProductsPage() {
  const { t } = useTranslation();
  return (
    <div className="grid gap-6">
      <h1 className="text-2xl font-semibold">{t('inventory.tabs.products')}</h1>
      <ProductsTab />
    </div>
  );
}

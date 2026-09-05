import { useTranslation } from 'react-i18next';

import { WarehousesTab } from './warehouses-tab';

export function WarehousesPage() {
  const { t } = useTranslation();
  return (
    <div className="grid gap-6">
      <h1 className="text-2xl font-semibold">{t('inventory.tabs.warehouses')}</h1>
      <WarehousesTab />
    </div>
  );
}

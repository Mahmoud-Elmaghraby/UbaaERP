import { useTranslation } from 'react-i18next';

import { WarehousesTab } from './warehouses-tab';
import { PageHeader } from '@erp-platform/ui';

export function WarehousesPage() {
  const { t } = useTranslation();
  return (
    <div className="grid gap-6">
      <PageHeader
        title={t('inventory.tabs.warehouses')}
        description={t('inventory.warehouses.subtitle')}
      />
      <WarehousesTab />
    </div>
  );
}

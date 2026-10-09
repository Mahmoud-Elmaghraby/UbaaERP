import { useTranslation } from 'react-i18next';
import { PageHeader } from '@erp-platform/ui';

import { InventorySettingsSection } from '../../settings/inventory-settings-section';

/** Inventory › ⚙ Settings (gear next to "المخزون" in the sidebar). */
export function InventorySettingsPage() {
  const { t } = useTranslation();
  return (
    <div className="grid gap-6">
      <PageHeader title={t('settings.inventory.pageTitle')} description={t('settings.inventory.pageDescription')} />
      <InventorySettingsSection />
    </div>
  );
}

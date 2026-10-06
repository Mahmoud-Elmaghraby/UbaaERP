import { useTranslation } from 'react-i18next';

import { DeliveriesTab } from './deliveries-tab';
import { PageHeader } from '@erp-platform/ui';

export function DeliveriesPage() {
  const { t } = useTranslation();
  return (
    <div className="grid gap-6">
      <PageHeader title={t('sales.tabs.deliveries')} description={t('sales.deliveries.subtitle')} />
      <DeliveriesTab />
    </div>
  );
}

import { useTranslation } from 'react-i18next';

import { SuppliersTab } from './suppliers-tab';
import { PageHeader } from '@erp-platform/ui';

export function SuppliersPage() {
  const { t } = useTranslation();
  return (
    <div className="grid gap-6">
      <PageHeader
        title={t('purchases.tabs.suppliers')}
        description={t('purchases.suppliers.subtitle')}
      />
      <SuppliersTab />
    </div>
  );
}

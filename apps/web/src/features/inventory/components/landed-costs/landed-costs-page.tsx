import { useTranslation } from 'react-i18next';

import { LandedCostsTab } from './landed-costs-tab';
import { PageHeader } from '@erp-platform/ui';

export function LandedCostsPage() {
  const { t } = useTranslation();
  return (
    <div className="grid gap-6">
      <PageHeader title={t('inventory.tabs.landedCosts')} />
      <LandedCostsTab />
    </div>
  );
}

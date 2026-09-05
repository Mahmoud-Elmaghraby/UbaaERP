import { useTranslation } from 'react-i18next';

import { LandedCostsTab } from './landed-costs-tab';

export function LandedCostsPage() {
  const { t } = useTranslation();
  return (
    <div className="grid gap-6">
      <h1 className="text-2xl font-semibold">{t('inventory.tabs.landedCosts')}</h1>
      <LandedCostsTab />
    </div>
  );
}

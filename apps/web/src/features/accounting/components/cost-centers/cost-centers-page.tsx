import { useTranslation } from 'react-i18next';

import { CostCentersTab } from './cost-centers-tab';

export function CostCentersPage() {
  const { t } = useTranslation();
  return (
    <div className="grid gap-6">
      <h1 className="text-2xl font-semibold">{t('accounting.tabs.costCenters')}</h1>
      <CostCentersTab />
    </div>
  );
}

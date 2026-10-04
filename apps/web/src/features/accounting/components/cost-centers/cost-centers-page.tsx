import { useTranslation } from 'react-i18next';

import { CostCentersTab } from './cost-centers-tab';
import { PageHeader } from '@erp-platform/ui';

export function CostCentersPage() {
  const { t } = useTranslation();
  return (
    <div className="grid gap-6">
      <PageHeader title={t('accounting.tabs.costCenters')} />
      <CostCentersTab />
    </div>
  );
}

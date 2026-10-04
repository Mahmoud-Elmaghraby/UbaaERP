import { useTranslation } from 'react-i18next';

import { UnitsOfMeasureTab } from './units-of-measure-tab';
import { PageHeader } from '@erp-platform/ui';

export function UnitsOfMeasurePage() {
  const { t } = useTranslation();
  return (
    <div className="grid gap-6">
      <PageHeader title={t('inventory.tabs.unitsOfMeasure')} />
      <UnitsOfMeasureTab />
    </div>
  );
}

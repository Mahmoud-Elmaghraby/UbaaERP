import { useTranslation } from 'react-i18next';

import { UnitsOfMeasureTab } from './units-of-measure-tab';

export function UnitsOfMeasurePage() {
  const { t } = useTranslation();
  return (
    <div className="grid gap-6">
      <h1 className="text-2xl font-semibold">{t('inventory.tabs.unitsOfMeasure')}</h1>
      <UnitsOfMeasureTab />
    </div>
  );
}

import { useTranslation } from 'react-i18next';

import { FiscalYearsTab } from './fiscal-years-tab';

export function FiscalYearsPage() {
  const { t } = useTranslation();
  return (
    <div className="grid gap-6">
      <h1 className="text-2xl font-semibold">{t('accounting.tabs.fiscalYears')}</h1>
      <FiscalYearsTab />
    </div>
  );
}

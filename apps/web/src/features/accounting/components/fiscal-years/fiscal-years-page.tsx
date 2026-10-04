import { useTranslation } from 'react-i18next';

import { FiscalYearsTab } from './fiscal-years-tab';
import { PageHeader } from '@erp-platform/ui';

export function FiscalYearsPage() {
  const { t } = useTranslation();
  return (
    <div className="grid gap-6">
      <PageHeader title={t('accounting.tabs.fiscalYears')} />
      <FiscalYearsTab />
    </div>
  );
}

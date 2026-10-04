import { useTranslation } from 'react-i18next';

import { QuotationsTab } from './quotations-tab';
import { PageHeader } from '@erp-platform/ui';

export function QuotationsPage() {
  const { t } = useTranslation();
  return (
    <div className="grid gap-6">
      <PageHeader title={t('sales.tabs.quotations')} />
      <QuotationsTab />
    </div>
  );
}

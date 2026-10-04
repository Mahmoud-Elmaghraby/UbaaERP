import { useTranslation } from 'react-i18next';

import { SalesInvoicesTab } from './sales-invoices-tab';
import { PageHeader } from '@erp-platform/ui';

export function SalesInvoicesPage() {
  const { t } = useTranslation();
  return (
    <div className="grid gap-6">
      <PageHeader title={t('sales.tabs.salesInvoices')} />
      <SalesInvoicesTab />
    </div>
  );
}

import { useTranslation } from 'react-i18next';

import { SalesInvoicesTab } from './sales-invoices-tab';

export function SalesInvoicesPage() {
  const { t } = useTranslation();
  return (
    <div className="grid gap-6">
      <h1 className="text-2xl font-semibold">{t('sales.tabs.salesInvoices')}</h1>
      <SalesInvoicesTab />
    </div>
  );
}

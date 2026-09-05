import { useTranslation } from 'react-i18next';

import { PurchaseInvoicesTab } from './purchase-invoices-tab';

export function PurchaseInvoicesPage() {
  const { t } = useTranslation();
  return (
    <div className="grid gap-6">
      <h1 className="text-2xl font-semibold">{t('purchases.tabs.purchaseInvoices')}</h1>
      <PurchaseInvoicesTab />
    </div>
  );
}

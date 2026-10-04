import { useTranslation } from 'react-i18next';

import { PurchaseInvoicesTab } from './purchase-invoices-tab';
import { PageHeader } from '@erp-platform/ui';

export function PurchaseInvoicesPage() {
  const { t } = useTranslation();
  return (
    <div className="grid gap-6">
      <PageHeader title={t('purchases.tabs.purchaseInvoices')} />
      <PurchaseInvoicesTab />
    </div>
  );
}

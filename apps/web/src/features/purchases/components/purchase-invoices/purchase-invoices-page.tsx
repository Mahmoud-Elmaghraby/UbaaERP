import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button, Can, PageHeader } from '@erp-platform/ui';
import { Plus } from 'lucide-react';

import { PURCHASE_INVOICES_PATH, PurchaseInvoicesTab } from './purchase-invoices-tab';

export function PurchaseInvoicesPage() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('purchases.tabs.purchaseInvoices')}
        description={t('purchases.purchaseInvoices.pageDescription')}
        actions={
          <Can permission="purchases.manage">
            <Button asChild>
              <Link to={`${PURCHASE_INVOICES_PATH}/new`}>
                <Plus />
                {t('purchases.purchaseInvoices.newInvoice')}
              </Link>
            </Button>
          </Can>
        }
      />
      <PurchaseInvoicesTab />
    </div>
  );
}

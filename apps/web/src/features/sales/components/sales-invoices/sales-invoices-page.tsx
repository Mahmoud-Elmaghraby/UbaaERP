import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button, Can, PageHeader } from '@erp-platform/ui';
import { Plus } from 'lucide-react';

import { SALES_INVOICES_PATH, SalesInvoicesTab } from './sales-invoices-tab';

export function SalesInvoicesPage() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('sales.tabs.salesInvoices')}
        description={t('sales.salesInvoices.pageDescription')}
        actions={
          <Can permission="sales.manage">
            <Button asChild>
              <Link to={`${SALES_INVOICES_PATH}/new`}>
                <Plus />
                {t('sales.salesInvoices.newInvoice')}
              </Link>
            </Button>
          </Can>
        }
      />
      <SalesInvoicesTab />
    </div>
  );
}

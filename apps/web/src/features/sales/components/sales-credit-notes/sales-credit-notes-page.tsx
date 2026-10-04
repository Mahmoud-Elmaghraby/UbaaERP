import { useTranslation } from 'react-i18next';

import { SalesCreditNotesTab } from './sales-credit-notes-tab';
import { PageHeader } from '@erp-platform/ui';

export function SalesCreditNotesPage() {
  const { t } = useTranslation();
  return (
    <div className="grid gap-6">
      <PageHeader title={t('sales.tabs.salesCreditNotes')} />
      <SalesCreditNotesTab />
    </div>
  );
}

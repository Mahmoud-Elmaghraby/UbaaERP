import { useTranslation } from 'react-i18next';

import { SalesCreditNotesTab } from './sales-credit-notes-tab';

export function SalesCreditNotesPage() {
  const { t } = useTranslation();
  return (
    <div className="grid gap-6">
      <h1 className="text-2xl font-semibold">{t('sales.tabs.salesCreditNotes')}</h1>
      <SalesCreditNotesTab />
    </div>
  );
}

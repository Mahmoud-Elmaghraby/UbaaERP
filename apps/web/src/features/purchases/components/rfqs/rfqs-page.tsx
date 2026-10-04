import { useTranslation } from 'react-i18next';

import { RfqsTab } from './rfqs-tab';
import { PageHeader } from '@erp-platform/ui';

export function RfqsPage() {
  const { t } = useTranslation();
  return (
    <div className="grid gap-6">
      <PageHeader title={t('purchases.tabs.rfqs')} />
      <RfqsTab />
    </div>
  );
}

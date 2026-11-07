import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { DocumentHeaderBar, SectionCard } from '../../../../components/document/document-layout';
import { ApplyLandedCostForm } from './apply-landed-cost-form';
import { LANDED_COSTS_PATH } from './landed-cost-paths';

/** /inventory/landed-costs/new — pick the received stock movements and spread the cost over them. */
export function ApplyLandedCostPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  return (
    <div className="flex flex-col">
      <DocumentHeaderBar
        backTo={LANDED_COSTS_PATH}
        backLabel={t('documents.back')}
        eyebrow={t('inventory.tabs.landedCosts')}
        title={t('inventory.landedCosts.apply')}
      />
      <div className="mx-auto w-full max-w-5xl">
        <SectionCard description={t('inventory.landedCosts.applyHint')}>
          <div className="pt-5">
            <ApplyLandedCostForm onDone={(id) => navigate(`${LANDED_COSTS_PATH}/${id}`, { replace: true })} />
          </div>
        </SectionCard>
      </div>
    </div>
  );
}

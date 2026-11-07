import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { LandedCostAllocationDto } from '@erp-platform/contracts';
import { Badge, Button, EmptyState, Skeleton } from '@erp-platform/ui';
import { FileQuestion } from 'lucide-react';

import { useLandedCost } from '../../api/landed-costs/queries';
import { Amount } from '../../../../components/amount';
import { DocumentBody, DocumentHeaderBar, InfoGrid, SectionCard, TotalsPanel } from '../../../../components/document/document-layout';
import { LandedCostAllocationsTable } from './landed-cost-allocations-table';
import { LANDED_COSTS_PATH } from './landed-cost-paths';

/** /inventory/landed-costs/:id — one applied landed cost and how it was spread. */
export function LandedCostPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const { data: landedCost, isLoading, isError } = useLandedCost(id);

  if (isLoading) return <Skeleton className="h-96 w-full rounded-xl" />;
  if (isError || !landedCost) {
    return (
      <EmptyState
        icon={<FileQuestion />}
        title={t('documents.notFound')}
        action={
          <Button variant="outline" asChild>
            <Link to={LANDED_COSTS_PATH}>{t('documents.back')}</Link>
          </Button>
        }
      />
    );
  }

  const sum = (pick: (a: LandedCostAllocationDto) => string) =>
    landedCost.allocations.reduce((total, a) => total + BigInt(pick(a)), 0n).toString();
  const capitalised = sum((a) => a.allocatedAmount.amountMinorUnits);
  const expensed = sum((a) => a.expensedAmount.amountMinorUnits);
  const createdAt = new Date(landedCost.createdAt);

  return (
    <div className="flex flex-col">
      <DocumentHeaderBar
        backTo={LANDED_COSTS_PATH}
        backLabel={t('documents.back')}
        eyebrow={t('inventory.tabs.landedCosts')}
        title={t('inventory.landedCosts.detailTitle', { date: createdAt.toLocaleDateString('ar-EG') })}
        status={
          <Badge variant="neutral">
            {landedCost.allocationMethod === 'by_quantity' ? t('inventory.landedCosts.byQuantity') : t('inventory.landedCosts.byValue')}
          </Badge>
        }
      />
      <DocumentBody
        main={
          <>
            <SectionCard title={t('documents.info')}>
              <InfoGrid
                items={[
                  { label: t('inventory.landedCosts.date'), value: createdAt.toLocaleString('ar-EG') },
                  {
                    label: t('inventory.landedCosts.allocationMethod'),
                    value: landedCost.allocationMethod === 'by_quantity' ? t('inventory.landedCosts.byQuantity') : t('inventory.landedCosts.byValue'),
                  },
                  ...(landedCost.referenceType
                    ? [{ label: t('inventory.landedCosts.reference'), value: `${landedCost.referenceType} ${landedCost.referenceId ?? ''}`.trim() }]
                    : []),
                  ...(landedCost.notes ? [{ label: t('inventory.stock.notes'), value: landedCost.notes, wide: true }] : []),
                ]}
              />
            </SectionCard>
            <SectionCard title={t('inventory.landedCosts.allocations')} description={String(landedCost.allocations.length)} flush>
              <LandedCostAllocationsTable landedCost={landedCost} />
            </SectionCard>
          </>
        }
        side={
          <TotalsPanel
            title={t('inventory.landedCosts.summary')}
            rows={[
              { label: t('inventory.landedCosts.allocatedAmount'), value: <Amount value={capitalised} hideCurrency /> },
              { label: t('inventory.landedCosts.expensedAmount'), value: <Amount value={expensed} hideCurrency /> },
            ]}
            totalLabel={t('inventory.landedCosts.totalCost')}
            totalValue={<Amount value={landedCost.totalCost.amountMinorUnits} hideCurrency />}
            currency={landedCost.totalCost.currency}
          />
        }
      />
    </div>
  );
}

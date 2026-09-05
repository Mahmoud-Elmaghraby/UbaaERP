import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ColumnDef, Row } from '@tanstack/react-table';
import type { LandedCostDto } from '@erp-platform/contracts';
import {
  Badge,
  Button,
  Can,
  DataTable,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@erp-platform/ui';

import { useLandedCosts } from '../../api/landed-costs/queries';
import { LandedCostAllocationsView } from './landed-cost-allocations-view';
import { ApplyLandedCostForm } from './apply-landed-cost-form';
import { formatMoney } from '../../../../lib/money';

export function LandedCostsTab() {
  const { t } = useTranslation();
  const { data: landedCosts, isLoading } = useLandedCosts();
  const [applyOpen, setApplyOpen] = useState(false);
  const [detail, setDetail] = useState<LandedCostDto | null>(null);

  const columns = useMemo<ColumnDef<LandedCostDto>[]>(
    () => [
      {
        id: 'date',
        header: t('inventory.landedCosts.date'),
        accessorFn: (row: LandedCostDto) => new Date(row.createdAt).toLocaleString('ar-EG'),
      },
      {
        id: 'totalCost',
        header: t('inventory.landedCosts.totalCost'),
        cell: ({ row }: { row: Row<LandedCostDto> }) => formatMoney(row.original.totalCost.amountMinorUnits, row.original.totalCost.currency),
      },
      {
        id: 'allocationMethod',
        header: t('inventory.landedCosts.allocationMethod'),
        cell: ({ row }: { row: Row<LandedCostDto> }) => (
          <Badge variant="secondary">
            {row.original.allocationMethod === 'by_quantity'
              ? t('inventory.landedCosts.byQuantity')
              : t('inventory.landedCosts.byValue')}
          </Badge>
        ),
      },
      {
        id: 'allocationsCount',
        header: t('inventory.landedCosts.allocations'),
        accessorFn: (row: LandedCostDto) => row.allocations.length,
      },
      {
        id: 'reference',
        header: t('inventory.landedCosts.reference'),
        accessorFn: (row: LandedCostDto) => (row.referenceType ? `${row.referenceType} ${row.referenceId ?? ''}`.trim() : '—'),
      },
      {
        id: 'notes',
        header: t('inventory.stock.notes'),
        accessorFn: (row: LandedCostDto) => row.notes ?? '—',
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }: { row: Row<LandedCostDto> }) => (
          <Button variant="ghost" size="sm" onClick={() => setDetail(row.original)}>
            {t('inventory.landedCosts.viewAllocations')}
          </Button>
        ),
      },
    ],
    [t],
  );

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">{t('inventory.landedCosts.subtitle')}</p>
        <Can permission="inventory.manage">
          <Button onClick={() => setApplyOpen(true)}>{t('inventory.landedCosts.apply')}</Button>
        </Can>
      </div>

      <DataTable columns={columns} data={landedCosts ?? []} isLoading={isLoading} />

      <Dialog open={applyOpen} onOpenChange={setApplyOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t('inventory.landedCosts.apply')}</DialogTitle>
          </DialogHeader>
          <ApplyLandedCostForm onDone={() => setApplyOpen(false)} />
        </DialogContent>
      </Dialog>

      <Dialog open={detail !== null} onOpenChange={(open) => !open && setDetail(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t('inventory.landedCosts.allocations')}</DialogTitle>
          </DialogHeader>
          {detail ? <LandedCostAllocationsView landedCost={detail} /> : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

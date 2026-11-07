import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { ColumnDef } from '@tanstack/react-table';
import type { LandedCostDto } from '@erp-platform/contracts';
import { Badge, Button, Can, DataTable, PageHeader } from '@erp-platform/ui';
import { Plus } from 'lucide-react';

import { useLandedCosts } from '../../api/landed-costs/queries';
import { Amount, AMOUNT_CELL } from '../../../../components/amount';
import { INV } from '../../../../lib/permissions';
import { LANDED_COSTS_PATH } from './landed-cost-paths';

/** التكاليف الإضافية (Landed costs) — freight, customs… spread over received stock; a row opens its allocations. */
export function LandedCostsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: landedCosts, isLoading } = useLandedCosts();

  const columns = useMemo<ColumnDef<LandedCostDto>[]>(
    () => [
      {
        id: 'date',
        header: t('inventory.landedCosts.date'),
        accessorFn: (row) => new Date(row.createdAt).getTime(),
        cell: ({ row }) => new Date(row.original.createdAt).toLocaleDateString('ar-EG'),
      },
      {
        id: 'allocationMethod',
        header: t('inventory.landedCosts.allocationMethod'),
        accessorFn: (row) => row.allocationMethod,
        cell: ({ row }) => (
          <Badge variant="neutral">
            {row.original.allocationMethod === 'by_quantity' ? t('inventory.landedCosts.byQuantity') : t('inventory.landedCosts.byValue')}
          </Badge>
        ),
      },
      {
        id: 'allocationsCount',
        header: t('inventory.landedCosts.allocations'),
        accessorFn: (row) => row.allocations.length,
        cell: ({ getValue }) => <span className="tabular-nums">{getValue<number>()}</span>,
      },
      {
        id: 'reference',
        header: t('inventory.landedCosts.reference'),
        accessorFn: (row) => (row.referenceType ? `${row.referenceType} ${row.referenceId ?? ''}`.trim() : ''),
        cell: ({ getValue }) => getValue<string>() || <span className="text-muted-foreground">—</span>,
      },
      {
        id: 'notes',
        header: t('inventory.stock.notes'),
        accessorFn: (row) => row.notes ?? '',
        cell: ({ getValue }) => <span className="line-clamp-1">{getValue<string>() || '—'}</span>,
      },
      {
        id: 'totalCost',
        header: () => <div className="text-end">{t('inventory.landedCosts.totalCost')}</div>,
        accessorFn: (row) => Number(row.totalCost.amountMinorUnits),
        cell: ({ row }) => (
          <div className={`${AMOUNT_CELL} font-medium`}>
            <Amount value={row.original.totalCost.amountMinorUnits} hideCurrency />
          </div>
        ),
      },
    ],
    [t],
  );

  return (
    <div className="grid gap-5">
      <PageHeader
        title={t('inventory.tabs.landedCosts')}
        description={t('inventory.landedCosts.subtitle')}
        actions={
          <Can permission={INV.landedCostsManage}>
            <Button asChild>
              <Link to={`${LANDED_COSTS_PATH}/new`}>
                <Plus className="me-1 h-4 w-4" />
                {t('inventory.landedCosts.apply')}
              </Link>
            </Button>
          </Can>
        }
      />
      <DataTable
        columns={columns}
        data={landedCosts ?? []}
        isLoading={isLoading}
        searchable
        searchPlaceholder={t('inventory.landedCosts.search')}
        onRowClick={(row) => navigate(`${LANDED_COSTS_PATH}/${row.id}`)}
      />
    </div>
  );
}

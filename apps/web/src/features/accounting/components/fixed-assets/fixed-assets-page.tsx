import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { ColumnDef } from '@tanstack/react-table';
import type { FixedAssetDto } from '@erp-platform/contracts';
import { Badge, Button, Can, DataTable, EmptyState, PageHeader, toast } from '@erp-platform/ui';
import { Building2, Calculator, Plus } from 'lucide-react';

import { useFixedAssets, useRunDepreciation } from '../../api/accounting-completion/queries';
import { ApiError } from '../../../../lib/api-client';
import { formatAmount } from '../../../../lib/money';
import { formatDate } from '../../../../lib/format-date';
import { Amount, AMOUNT_CELL } from '../../../../components/amount';
import { useBaseCurrency } from '../../../settings/queries';
import { FIXED_ASSET_STATUS_VARIANT } from './fixed-asset-status';

function sum(rows: FixedAssetDto[], pick: (row: FixedAssetDto) => string): string {
  return rows.reduce((total, row) => total + BigInt(pick(row)), 0n).toString();
}

/** سجل الأصول الثابتة — cost, accumulated depreciation and book value, plus the monthly depreciation run. */
export function FixedAssetsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const currency = useBaseCurrency();
  const { data, isLoading } = useFixedAssets();
  const run = useRunDepreciation();
  const assets = data ?? [];
  const inUse = assets.filter((a) => a.status !== 'disposed');

  const columns = useMemo<ColumnDef<FixedAssetDto>[]>(
    () => [
      { accessorKey: 'code', header: t('accounting.fixedAssets.code'), cell: ({ row }) => <span className="font-medium tabular-nums">{row.original.code}</span> },
      { accessorKey: 'name', header: t('accounting.fixedAssets.name') },
      {
        accessorKey: 'acquisitionDate',
        header: t('accounting.fixedAssets.acquisitionDate'),
        cell: ({ row }) => <span className="tabular-nums">{formatDate(row.original.acquisitionDate)}</span>,
      },
      {
        accessorKey: 'costMinorUnits',
        header: () => <div className="text-end">{t('accounting.fixedAssets.cost')}</div>,
        cell: ({ row }) => <div className={AMOUNT_CELL}><Amount value={row.original.costMinorUnits} hideCurrency /></div>,
      },
      {
        accessorKey: 'accumulatedMinorUnits',
        header: () => <div className="text-end">{t('accounting.fixedAssets.accumulated')}</div>,
        cell: ({ row }) => <div className={AMOUNT_CELL}><Amount value={row.original.accumulatedMinorUnits} hideCurrency /></div>,
      },
      {
        accessorKey: 'bookValueMinorUnits',
        header: () => <div className="text-end">{t('accounting.fixedAssets.bookValue')}</div>,
        cell: ({ row }) => <div className={AMOUNT_CELL}><Amount value={row.original.bookValueMinorUnits} hideCurrency className="font-medium" /></div>,
      },
      {
        accessorKey: 'lastDepreciatedThrough',
        header: t('accounting.fixedAssets.depreciatedThrough'),
        cell: ({ row }) => <span className="tabular-nums text-muted-foreground">{row.original.lastDepreciatedThrough ? formatDate(row.original.lastDepreciatedThrough) : '—'}</span>,
      },
      {
        accessorKey: 'status',
        header: t('common.status'),
        cell: ({ row }) => (
          <Badge variant={FIXED_ASSET_STATUS_VARIANT[row.original.status]} dot>
            {t(`accounting.fixedAssets.statuses.${row.original.status}`)}
          </Badge>
        ),
      },
    ],
    [t],
  );

  async function runDepreciation() {
    try {
      const result = await run.mutateAsync(undefined);
      toast.success(
        result.entries > 0
          ? t('accounting.fixedAssets.depreciationDone', { entries: result.entries, amount: formatAmount(result.totalMinorUnits), currency })
          : t('accounting.fixedAssets.depreciationNothing'),
      );
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('common.error'));
    }
  }

  return (
    <div className="grid gap-5">
      <PageHeader
        title={t('accounting.tabs.fixedAssets')}
        description={t('accounting.fixedAssets.subtitle')}
        actions={
          <Can permission="accounting.manage">
            <Button variant="outline" onClick={runDepreciation} disabled={run.isPending} title={t('accounting.fixedAssets.runHint')}>
              <Calculator className="me-1 h-4 w-4" />
              {t('accounting.fixedAssets.runDepreciation')}
            </Button>
            <Button asChild>
              <Link to="/accounting/fixed-assets/new">
                <Plus className="me-1 h-4 w-4" />
                {t('accounting.fixedAssets.new')}
              </Link>
            </Button>
          </Can>
        }
      />

      {assets.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            { label: t('accounting.fixedAssets.totalCost'), value: sum(inUse, (a) => a.costMinorUnits) },
            { label: t('accounting.fixedAssets.totalAccumulated'), value: sum(inUse, (a) => a.accumulatedMinorUnits) },
            { label: t('accounting.fixedAssets.totalBookValue'), value: sum(inUse, (a) => a.bookValueMinorUnits) },
          ].map((card) => (
            <div key={card.label} className="rounded-xl border bg-card px-5 py-4 shadow-card">
              <p className="text-[13px] text-muted-foreground">{card.label}</p>
              <p className="mt-1 text-xl font-semibold">
                <Amount value={card.value} currency={currency} />
              </p>
            </div>
          ))}
        </div>
      ) : null}

      {!isLoading && assets.length === 0 ? (
        <EmptyState icon={<Building2 />} title={t('accounting.fixedAssets.emptyTitle')} description={t('accounting.fixedAssets.emptyHint')} />
      ) : (
        <DataTable
          columns={columns}
          data={assets}
          isLoading={isLoading}
          searchable
          onRowClick={(row) => navigate(`/accounting/fixed-assets/${row.id}`)}
        />
      )}
    </div>
  );
}

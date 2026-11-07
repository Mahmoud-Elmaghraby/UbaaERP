import { useMemo } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { ColumnDef } from '@tanstack/react-table';
import type { UnitOfMeasureDto } from '@erp-platform/contracts';
import { Badge, Button, Can, DataTable, PageHeader } from '@erp-platform/ui';
import { Plus } from 'lucide-react';

import { useUnitsOfMeasure } from '../../api/units-of-measure/queries';
import { StatusTabs } from '../../../../components/list/status-tabs';
import { INV } from '../../../../lib/permissions';
import { UnitConverter } from './unit-converter';
import { UNITS_PATH } from './unit-paths';

const STATUS_TABS = ['all', 'base', 'derived', 'inactive'] as const;
type StatusTab = (typeof STATUS_TABS)[number];

function matches(unit: UnitOfMeasureDto, tab: StatusTab): boolean {
  if (tab === 'base') return !unit.baseUnitId;
  if (tab === 'derived') return Boolean(unit.baseUnitId);
  if (tab === 'inactive') return !unit.isActive;
  return true;
}

/** وحدات القياس — base units and the units derived from them; a row opens the unit's form. */
export function UnitsOfMeasurePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const rawStatus = params.get('status');
  const status: StatusTab = STATUS_TABS.includes(rawStatus as StatusTab) ? (rawStatus as StatusTab) : 'all';
  const { data: units, isLoading } = useUnitsOfMeasure();
  const unitById = useMemo(() => new Map((units ?? []).map((u) => [u.id, u])), [units]);

  const counts = useMemo(() => {
    const all = units ?? [];
    return Object.fromEntries(STATUS_TABS.map((tab) => [tab, all.filter((u) => matches(u, tab)).length])) as Record<StatusTab, number>;
  }, [units]);
  // Each family together: the base unit first, then what derives from it (by factor).
  const visible = useMemo(() => {
    const familyName = (u: UnitOfMeasureDto) => (u.baseUnitId ? (unitById.get(u.baseUnitId)?.name ?? '') : u.name);
    return (units ?? [])
      .filter((u) => matches(u, status))
      .sort(
        (a, b) =>
          familyName(a).localeCompare(familyName(b), 'ar') ||
          Number(Boolean(a.baseUnitId)) - Number(Boolean(b.baseUnitId)) ||
          a.conversionFactor - b.conversionFactor,
      );
  }, [units, status, unitById]);

  const columns = useMemo<ColumnDef<UnitOfMeasureDto>[]>(
    () => [
      {
        accessorKey: 'name',
        header: t('inventory.unitsOfMeasure.name'),
        cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
      },
      {
        accessorKey: 'symbol',
        header: t('inventory.unitsOfMeasure.symbol'),
        cell: ({ row }) => <span className="text-muted-foreground" dir="auto">{row.original.symbol}</span>,
      },
      {
        id: 'baseUnit',
        header: t('inventory.unitsOfMeasure.baseUnit'),
        accessorFn: (row) => (row.baseUnitId ? (unitById.get(row.baseUnitId)?.name ?? '—') : ''),
        cell: ({ row }) =>
          row.original.baseUnitId ? (
            (unitById.get(row.original.baseUnitId)?.name ?? '—')
          ) : (
            <Badge variant="brand">{t('inventory.unitsOfMeasure.baseUnitBadge')}</Badge>
          ),
      },
      {
        id: 'conversion',
        header: t('inventory.unitsOfMeasure.conversionFactor'),
        accessorFn: (row) => (row.baseUnitId ? row.conversionFactor : 0),
        cell: ({ row }) => {
          const unit = row.original;
          const base = unit.baseUnitId ? unitById.get(unit.baseUnitId) : undefined;
          return base ? (
            <span className="tabular-nums">
              1 {unit.symbol} = {unit.conversionFactor} {base.symbol}
            </span>
          ) : (
            <span className="text-muted-foreground">—</span>
          );
        },
      },
      {
        id: 'isActive',
        header: t('common.status'),
        accessorFn: (row) => (row.isActive ? t('common.active') : t('common.inactive')),
        cell: ({ row }) => (
          <Badge variant={row.original.isActive ? 'success' : 'neutral'} dot>
            {row.original.isActive ? t('common.active') : t('common.inactive')}
          </Badge>
        ),
      },
    ],
    [t, unitById],
  );

  return (
    <div className="grid gap-5">
      <PageHeader
        title={t('inventory.tabs.unitsOfMeasure')}
        description={t('inventory.unitsOfMeasure.subtitle')}
        actions={
          <Can permission={INV.settingsManage}>
            <Button asChild>
              <Link to={`${UNITS_PATH}/new`}>
                <Plus className="me-1 h-4 w-4" />
                {t('inventory.unitsOfMeasure.newUnit')}
              </Link>
            </Button>
          </Can>
        }
      />
      <DataTable
        columns={columns}
        data={visible}
        isLoading={isLoading}
        searchable
        searchPlaceholder={t('inventory.unitsOfMeasure.search')}
        onRowClick={(unit) => navigate(`${UNITS_PATH}/${unit.id}/edit`)}
        toolbar={
          <StatusTabs
            tabs={STATUS_TABS}
            value={status}
            onChange={(tab) => setParams(tab === 'all' ? {} : { status: tab }, { replace: true })}
            label={(tab) => t(`inventory.unitsOfMeasure.filter.${tab}`)}
            counts={units ? counts : undefined}
          />
        }
      />
      <UnitConverter units={units ?? []} />
    </div>
  );
}

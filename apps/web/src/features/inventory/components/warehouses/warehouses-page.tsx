import { useMemo } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { ColumnDef } from '@tanstack/react-table';
import type { WarehouseDto } from '@erp-platform/contracts';
import { Badge, Button, Can, DataTable, PageHeader } from '@erp-platform/ui';
import { Plus } from 'lucide-react';

import { useBranches } from '../../../settings/queries';
import { useWarehouses } from '../../api/warehouses/queries';
import { StatusTabs } from '../../../../components/list/status-tabs';
import { INV } from '../../../../lib/permissions';
import { WAREHOUSES_PATH } from './warehouse-paths';

const STATUS_TABS = ['all', 'active', 'inactive'] as const;
type StatusTab = (typeof STATUS_TABS)[number];

/** المخازن — searchable list; a row opens the warehouse page (locations + stock summary). */
export function WarehousesPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const rawStatus = params.get('status');
  const status: StatusTab = STATUS_TABS.includes(rawStatus as StatusTab) ? (rawStatus as StatusTab) : 'all';
  const { data: warehouses, isLoading } = useWarehouses();
  const { data: branches } = useBranches();
  const branchName = useMemo(() => new Map((branches ?? []).map((b) => [b.id, b.name])), [branches]);

  const counts = useMemo(() => {
    const all = warehouses ?? [];
    const active = all.filter((w) => w.isActive).length;
    return { all: all.length, active, inactive: all.length - active };
  }, [warehouses]);
  const visible = useMemo(
    () => (warehouses ?? []).filter((w) => (status === 'all' ? true : status === 'active' ? w.isActive : !w.isActive)),
    [warehouses, status],
  );

  const columns = useMemo<ColumnDef<WarehouseDto>[]>(
    () => [
      {
        accessorKey: 'code',
        header: t('inventory.warehouses.code'),
        cell: ({ row }) => <span className="tabular-nums text-muted-foreground" dir="ltr">{row.original.code}</span>,
      },
      {
        accessorKey: 'name',
        header: t('inventory.warehouses.name'),
        cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
      },
      {
        id: 'branch',
        header: t('inventory.warehouses.branch'),
        accessorFn: (row) => (row.branchId ? (branchName.get(row.branchId) ?? '—') : t('inventory.warehouses.noBranch')),
      },
      {
        id: 'address',
        header: t('inventory.warehouses.address'),
        accessorFn: (row) => row.address ?? '',
        cell: ({ getValue }) => getValue<string>() || <span className="text-muted-foreground">—</span>,
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
    [t, branchName],
  );

  return (
    <div className="grid gap-5">
      <PageHeader
        title={t('inventory.tabs.warehouses')}
        description={t('inventory.warehouses.subtitle')}
        actions={
          <Can permission={INV.settingsManage}>
            <Button asChild>
              <Link to={`${WAREHOUSES_PATH}/new`}>
                <Plus className="me-1 h-4 w-4" />
                {t('inventory.warehouses.newWarehouse')}
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
        searchPlaceholder={t('inventory.warehouses.search')}
        onRowClick={(warehouse) => navigate(`${WAREHOUSES_PATH}/${warehouse.id}`)}
        toolbar={
          <StatusTabs
            tabs={STATUS_TABS}
            value={status}
            onChange={(tab) => setParams(tab === 'all' ? {} : { status: tab }, { replace: true })}
            label={(tab) => (tab === 'all' ? t('common.all') : tab === 'active' ? t('common.active') : t('common.inactive'))}
            counts={warehouses ? counts : undefined}
          />
        }
      />
    </div>
  );
}

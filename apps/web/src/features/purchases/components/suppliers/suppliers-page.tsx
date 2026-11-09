import { useMemo } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { ColumnDef } from '@tanstack/react-table';
import type { SupplierDto } from '@erp-platform/contracts';
import { Badge, Button, Can, DataTable, PageHeader } from '@erp-platform/ui';
import { Plus } from 'lucide-react';

import { useSuppliers } from '../../api/suppliers/queries';
import { usePartyBalances } from '../../../statements/queries';
import { StatusTabs } from '../../../../components/list/status-tabs';
import { Amount, AMOUNT_CELL } from '../../../../components/amount';
import { SUPPLIERS_PATH } from './supplier-paths';
import { PURCH } from '../../../../lib/permissions';

const STATUS_TABS = ['all', 'active', 'inactive'] as const;
type StatusTab = (typeof STATUS_TABS)[number];

/** الموردين — search by name / code / phone, with each supplier's balance; a row opens the supplier's page. */
export function SuppliersPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const rawStatus = params.get('status');
  const status: StatusTab = STATUS_TABS.includes(rawStatus as StatusTab) ? (rawStatus as StatusTab) : 'all';
  const { data: suppliers, isLoading } = useSuppliers();
  // One call for every supplier's balance (the payables report, zero balances included).
  const { data: balances } = usePartyBalances('supplier', { nonZeroOnly: false });

  const balanceById = useMemo(() => new Map((balances?.rows ?? []).map((row) => [row.partyId, row.balance])), [balances]);

  const counts = useMemo(() => {
    const list = suppliers ?? [];
    const active = list.filter((s) => s.isActive).length;
    return { all: list.length, active, inactive: list.length - active };
  }, [suppliers]);

  const rows = useMemo(
    () => (suppliers ?? []).filter((s) => (status === 'all' ? true : status === 'active' ? s.isActive : !s.isActive)),
    [suppliers, status],
  );

  const columns = useMemo<ColumnDef<SupplierDto>[]>(
    () => [
      {
        accessorKey: 'code',
        header: t('purchases.suppliers.code'),
        cell: ({ row }) => <span className="tabular-nums text-muted-foreground">{row.original.code}</span>,
      },
      {
        accessorKey: 'name',
        header: t('purchases.suppliers.name'),
        cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
      },
      {
        id: 'phone',
        header: t('purchases.suppliers.phone'),
        accessorFn: (row) => row.phone ?? '',
        cell: ({ row }) =>
          row.original.phone ? <span dir="ltr">{row.original.phone}</span> : <span className="text-muted-foreground">—</span>,
      },
      {
        id: 'balance',
        header: () => <div className="text-end">{t('statements.balances.balance')}</div>,
        cell: ({ row }) => {
          const balance = balanceById.get(row.original.id);
          return (
            <div className={AMOUNT_CELL}>
              <Amount value={balance?.amountMinorUnits} currency={balance?.currency} zeroAsDash />
            </div>
          );
        },
      },
      {
        id: 'isActive',
        header: t('common.status'),
        cell: ({ row }) => (
          <Badge variant={row.original.isActive ? 'success' : 'neutral'} dot>
            {row.original.isActive ? t('common.active') : t('common.inactive')}
          </Badge>
        ),
      },
    ],
    [t, balanceById],
  );

  return (
    <div className="grid gap-5">
      <PageHeader
        title={t('purchases.tabs.suppliers')}
        description={t('purchases.suppliers.subtitle')}
        actions={
          <Can permission={PURCH.create}>
            <Button asChild>
              <Link to={`${SUPPLIERS_PATH}/new`}>
                <Plus className="me-1 h-4 w-4" />
                {t('purchases.suppliers.newSupplier')}
              </Link>
            </Button>
          </Can>
        }
      />
      <DataTable
        columns={columns}
        data={rows}
        isLoading={isLoading}
        searchable
        searchPlaceholder={t('purchases.suppliers.search')}
        onRowClick={(supplier) => navigate(`${SUPPLIERS_PATH}/${supplier.id}`)}
        toolbar={
          <StatusTabs
            tabs={STATUS_TABS}
            value={status}
            onChange={(tab) => setParams(tab === 'all' ? {} : { status: tab }, { replace: true })}
            label={(tab) => (tab === 'all' ? t('common.all') : tab === 'active' ? t('common.active') : t('common.inactive'))}
            counts={suppliers ? counts : undefined}
          />
        }
      />
    </div>
  );
}

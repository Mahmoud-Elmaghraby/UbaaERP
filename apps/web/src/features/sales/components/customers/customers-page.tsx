import { useMemo } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { ColumnDef } from '@tanstack/react-table';
import type { CustomerDto } from '@erp-platform/contracts';
import { Badge, Button, Can, DataTable, PageHeader } from '@erp-platform/ui';
import { Plus } from 'lucide-react';

import { useCustomers } from '../../api/customers/queries';
import { usePartyBalances } from '../../../statements/queries';
import { StatusTabs } from '../../../../components/list/status-tabs';
import { Amount, AMOUNT_CELL } from '../../../../components/amount';

const STATUS_TABS = ['all', 'active', 'inactive'] as const;
type StatusTab = (typeof STATUS_TABS)[number];

/** العملاء — search by name / code / phone, a row opens the customer's page. */
export function CustomersPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const status = (params.get('status') as StatusTab | null) ?? 'all';
  const { data: customers, isLoading } = useCustomers();
  // One call for every customer's balance (the receivables report, zero balances included).
  const { data: balances } = usePartyBalances('customer', { nonZeroOnly: false });

  const balanceById = useMemo(
    () => new Map((balances?.rows ?? []).map((row) => [row.partyId, row.balance])),
    [balances],
  );

  const counts = useMemo(() => {
    const list = customers ?? [];
    const active = list.filter((c) => c.isActive).length;
    return { all: list.length, active, inactive: list.length - active };
  }, [customers]);

  const rows = useMemo(
    () =>
      (customers ?? []).filter((c) =>
        status === 'all' ? true : status === 'active' ? c.isActive : !c.isActive,
      ),
    [customers, status],
  );

  const columns = useMemo<ColumnDef<CustomerDto>[]>(
    () => [
      {
        accessorKey: 'code',
        header: t('sales.customers.code'),
        cell: ({ row }) => <span className="tabular-nums text-muted-foreground">{row.original.code}</span>,
      },
      {
        accessorKey: 'name',
        header: t('sales.customers.name'),
        cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
      },
      {
        id: 'phone',
        header: t('sales.customers.phone'),
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
        title={t('sales.tabs.customers')}
        description={t('sales.customers.subtitle')}
        actions={
          <Can permission="sales.manage">
            <Button asChild>
              <Link to="/sales/customers/new">
                <Plus className="me-1 h-4 w-4" />
                {t('sales.customers.newCustomer')}
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
        searchPlaceholder={t('sales.customers.search')}
        onRowClick={(customer) => navigate(`/sales/customers/${customer.id}`)}
        toolbar={
          <StatusTabs
            tabs={STATUS_TABS}
            value={status}
            onChange={(tab) => setParams(tab === 'all' ? {} : { status: tab }, { replace: true })}
            label={(tab) =>
              tab === 'all' ? t('common.all') : tab === 'active' ? t('common.active') : t('common.inactive')
            }
            counts={customers ? counts : undefined}
          />
        }
      />
    </div>
  );
}

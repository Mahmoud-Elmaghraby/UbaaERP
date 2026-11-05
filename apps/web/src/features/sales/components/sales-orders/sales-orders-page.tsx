import { useMemo } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { ColumnDef } from '@tanstack/react-table';
import type { SalesOrderListItemDto, SalesOrderStatusDto } from '@erp-platform/contracts';
import { Badge, Button, Can, DataTable, PageHeader } from '@erp-platform/ui';
import { Plus } from 'lucide-react';

import { useCustomers } from '../../api/customers/queries';
import { useSalesOrders } from '../../api/sales-orders/queries';
import { useSalesInvoiceRegister } from '../../api/sales-invoices/queries';
import { Amount, AMOUNT_CELL } from '../../../../components/amount';
import { StatusTabs } from '../../../../components/list/status-tabs';
import { formatDate } from '../../../../lib/format-date';
import { SALES_ORDER_STATUS_VARIANT, SALES_ORDERS_PATH, salesOrderStatusLabelKey } from './sales-order-status';

const STATUS_TABS = ['all', 'draft', 'confirmed', 'partially_delivered', 'fully_delivered', 'cancelled'] as const;
type StatusTab = (typeof STATUS_TABS)[number];

type Row = SalesOrderListItemDto & { customerName: string; invoicedPercent: number | null };

/** Share of the order's total already invoiced (non-cancelled invoices), 0–100. */
function invoicedPercent(totalMinor: string | undefined, invoicedMinor: bigint | undefined): number | null {
  if (!totalMinor || invoicedMinor === undefined) return null;
  const total = BigInt(totalMinor);
  if (total <= 0n) return null;
  const pct = Number((invoicedMinor * 100n) / total);
  return Math.min(100, Math.max(0, pct));
}

/** أوامر البيع — status tabs, search, invoiced progress; a row opens the order's page. */
export function SalesOrdersPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const rawStatus = params.get('status');
  const status: StatusTab = STATUS_TABS.includes(rawStatus as StatusTab) ? (rawStatus as StatusTab) : 'all';
  const { data: orders, isLoading } = useSalesOrders();
  const { data: customers } = useCustomers();
  const { data: invoices } = useSalesInvoiceRegister({});

  const rows = useMemo<Row[]>(() => {
    const nameById = new Map((customers ?? []).map((c) => [c.id, c.name]));
    const invoicedByOrder = new Map<string, bigint>();
    for (const invoice of invoices ?? []) {
      if (invoice.status === 'cancelled') continue;
      invoicedByOrder.set(
        invoice.salesOrderId,
        (invoicedByOrder.get(invoice.salesOrderId) ?? 0n) + BigInt(invoice.totalMinorUnits),
      );
    }
    return (orders ?? []).map((order) => ({
      ...order,
      customerName: nameById.get(order.customerId) ?? '—',
      invoicedPercent: invoices
        ? invoicedPercent(order.totalAmount?.amountMinorUnits, invoicedByOrder.get(order.id) ?? 0n)
        : null,
    }));
  }, [orders, customers, invoices]);

  const counts = useMemo(() => {
    const result: Partial<Record<StatusTab, number>> = { all: rows.length };
    for (const row of rows) result[row.status] = (result[row.status] ?? 0) + 1;
    return result;
  }, [rows]);

  const visible = useMemo(() => (status === 'all' ? rows : rows.filter((r) => r.status === status)), [rows, status]);

  const columns = useMemo<ColumnDef<Row>[]>(
    () => [
      {
        accessorKey: 'soNumber',
        header: t('sales.salesOrders.soNumber'),
        cell: ({ row }) => <span className="font-medium tabular-nums">{row.original.soNumber}</span>,
      },
      {
        id: 'date',
        header: t('sales.salesOrders.date'),
        accessorFn: (row) => formatDate(row.createdAt),
        cell: ({ getValue }) => <span className="tabular-nums">{String(getValue())}</span>,
      },
      { accessorKey: 'customerName', header: t('sales.salesOrders.customer') },
      {
        id: 'total',
        header: () => <div className="text-end">{t('sales.salesOrders.totalAmount')}</div>,
        accessorFn: (row) => row.totalAmount?.amountMinorUnits ?? '',
        cell: ({ row }) => (
          <div className={AMOUNT_CELL}>
            <Amount value={row.original.totalAmount?.amountMinorUnits} currency={row.original.totalAmount?.currency} />
          </div>
        ),
      },
      {
        id: 'invoiced',
        header: t('sales.salesOrders.invoiced'),
        enableGlobalFilter: false,
        accessorFn: (row) => row.invoicedPercent ?? -1,
        cell: ({ row }) => {
          const pct = row.original.invoicedPercent;
          if (pct === null || row.original.status === 'draft' || row.original.status === 'cancelled') {
            return <span className="text-muted-foreground">—</span>;
          }
          return (
            <div className="flex items-center gap-2">
              <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
              </div>
              <span className="text-xs tabular-nums text-muted-foreground">{pct}%</span>
            </div>
          );
        },
      },
      {
        id: 'status',
        header: t('common.status'),
        accessorFn: (row) => t(salesOrderStatusLabelKey(row.status)),
        cell: ({ row }) => (
          <Badge variant={SALES_ORDER_STATUS_VARIANT[row.original.status]} dot>
            {t(salesOrderStatusLabelKey(row.original.status))}
          </Badge>
        ),
      },
    ],
    [t],
  );

  return (
    <div className="grid gap-5">
      <PageHeader
        title={t('sales.tabs.salesOrders')}
        description={t('sales.salesOrders.subtitle')}
        actions={
          <Can permission="sales.manage">
            <Button asChild>
              <Link to={`${SALES_ORDERS_PATH}/new`}>
                <Plus className="me-1 h-4 w-4" />
                {t('sales.salesOrders.newOrder')}
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
        searchPlaceholder={t('sales.salesOrders.search')}
        onRowClick={(row) => navigate(`${SALES_ORDERS_PATH}/${row.id}`)}
        toolbar={
          <StatusTabs
            tabs={STATUS_TABS}
            value={status}
            onChange={(tab) => setParams(tab === 'all' ? {} : { status: tab }, { replace: true })}
            label={(tab) => (tab === 'all' ? t('documents.all') : t(salesOrderStatusLabelKey(tab as SalesOrderStatusDto)))}
            counts={counts}
          />
        }
      />
    </div>
  );
}

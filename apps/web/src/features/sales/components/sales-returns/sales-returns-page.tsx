import { useMemo } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { ColumnDef } from '@tanstack/react-table';
import type { SalesReturnDto } from '@erp-platform/contracts';
import { Badge, Button, Can, DataTable, PageHeader } from '@erp-platform/ui';
import { Plus } from 'lucide-react';

import { useCustomers } from '../../api/customers/queries';
import { useDeliveries } from '../../api/deliveries/queries';
import { useSalesOrders } from '../../api/sales-orders/queries';
import { useSalesReturns } from '../../api/sales-returns/queries';
import { StatusTabs } from '../../../../components/list/status-tabs';
import { formatDate } from '../../../../lib/format-date';
import { SALES_RETURNS_PATH, SALES_RETURN_STATUS_VARIANT, salesReturnStatusLabelKey } from './sales-return-status';
import { SALES } from '../../../../lib/permissions';

const STATUS_TABS = ['all', 'draft', 'confirmed', 'cancelled'] as const;
type StatusTab = (typeof STATUS_TABS)[number];

interface ReturnRow extends SalesReturnDto {
  deliveryNumber: string;
  customerName: string;
}

/** مرتجعات المبيعات — status tabs, search, a row opens the return's page. */
export function SalesReturnsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const status = (params.get('status') as StatusTab | null) ?? 'all';
  const { data: returns, isLoading } = useSalesReturns();
  const { data: deliveries } = useDeliveries();
  const { data: salesOrders } = useSalesOrders();
  const { data: customers } = useCustomers();

  const rows = useMemo<ReturnRow[]>(() => {
    const deliveryById = new Map((deliveries ?? []).map((d) => [d.id, d]));
    const customerBySo = new Map((salesOrders ?? []).map((so) => [so.id, so.customerId]));
    const customerById = new Map((customers ?? []).map((c) => [c.id, c.name]));
    return (returns ?? []).map((salesReturn) => {
      const delivery = deliveryById.get(salesReturn.deliveryId);
      const customerId = delivery ? customerBySo.get(delivery.salesOrderId) : undefined;
      return {
        ...salesReturn,
        deliveryNumber: delivery?.deliveryNumber ?? '—',
        customerName: (customerId && customerById.get(customerId)) || '—',
      };
    });
  }, [returns, deliveries, salesOrders, customers]);

  const counts = useMemo(() => {
    const result: Partial<Record<StatusTab, number>> = { all: rows.length };
    for (const row of rows) result[row.status] = (result[row.status] ?? 0) + 1;
    return result;
  }, [rows]);

  const visibleRows = useMemo(
    () => (status === 'all' ? rows : rows.filter((row) => row.status === status)),
    [rows, status],
  );

  const columns = useMemo<ColumnDef<ReturnRow>[]>(
    () => [
      {
        accessorKey: 'returnNumber',
        header: t('sales.salesReturns.returnNumber'),
        cell: ({ row }) => <span className="font-medium tabular-nums">{row.original.returnNumber}</span>,
      },
      {
        id: 'returnDate',
        header: t('sales.salesReturns.returnDate'),
        accessorFn: (row) => row.returnDate ?? '',
        cell: ({ row }) => <span className="tabular-nums">{formatDate(row.original.returnDate)}</span>,
      },
      {
        accessorKey: 'deliveryNumber',
        header: t('sales.salesReturns.delivery'),
        cell: ({ row }) => <span className="tabular-nums">{row.original.deliveryNumber}</span>,
      },
      { accessorKey: 'customerName', header: t('sales.salesReturns.customer') },
      {
        id: 'status',
        header: t('common.status'),
        accessorFn: (row) => t(salesReturnStatusLabelKey(row.status)),
        cell: ({ row }) => (
          <Badge variant={SALES_RETURN_STATUS_VARIANT[row.original.status]} dot>
            {t(salesReturnStatusLabelKey(row.original.status))}
          </Badge>
        ),
      },
    ],
    [t],
  );

  return (
    <div className="grid gap-5">
      <PageHeader
        title={t('sales.tabs.salesReturns')}
        description={t('sales.salesReturns.subtitle')}
        actions={
          <Can permission={SALES.create}>
            <Button asChild>
              <Link to={`${SALES_RETURNS_PATH}/new`}>
                <Plus className="me-1 h-4 w-4" />
                {t('sales.salesReturns.newReturn')}
              </Link>
            </Button>
          </Can>
        }
      />
      <DataTable
        columns={columns}
        data={visibleRows}
        isLoading={isLoading}
        searchable
        searchPlaceholder={t('sales.salesReturns.search')}
        onRowClick={(salesReturn) => navigate(`${SALES_RETURNS_PATH}/${salesReturn.id}`)}
        toolbar={
          <StatusTabs
            tabs={STATUS_TABS}
            value={status}
            onChange={(tab) => setParams(tab === 'all' ? {} : { status: tab }, { replace: true })}
            label={(tab) => (tab === 'all' ? t('documents.all') : t(salesReturnStatusLabelKey(tab)))}
            counts={counts}
          />
        }
      />
    </div>
  );
}

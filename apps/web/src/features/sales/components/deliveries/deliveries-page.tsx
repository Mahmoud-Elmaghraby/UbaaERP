import { useMemo } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { ColumnDef } from '@tanstack/react-table';
import type { DeliveryDto } from '@erp-platform/contracts';
import { Badge, Button, Can, DataTable, PageHeader } from '@erp-platform/ui';
import { Plus } from 'lucide-react';

import { useWarehouses } from '../../../inventory/api/warehouses/queries';
import { useCustomers } from '../../api/customers/queries';
import { useDeliveries } from '../../api/deliveries/queries';
import { useSalesOrders } from '../../api/sales-orders/queries';
import { StatusTabs } from '../../../../components/list/status-tabs';
import { formatDate } from '../../../../lib/format-date';
import { DELIVERIES_PATH, DELIVERY_STATUS_VARIANT, deliveryStatusLabelKey } from './delivery-status';
import { SALES } from '../../../../lib/permissions';

const STATUS_TABS = ['all', 'draft', 'confirmed', 'cancelled'] as const;
type StatusTab = (typeof STATUS_TABS)[number];

interface DeliveryRow extends DeliveryDto {
  soNumber: string;
  customerName: string;
  warehouseName: string;
}

/** التسليمات — status tabs, search, a row opens the delivery's page. */
export function DeliveriesPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const status = (params.get('status') as StatusTab | null) ?? 'all';
  const { data: deliveries, isLoading } = useDeliveries();
  const { data: salesOrders } = useSalesOrders();
  const { data: customers } = useCustomers();
  const { data: warehouses } = useWarehouses();

  const rows = useMemo<DeliveryRow[]>(() => {
    const soById = new Map((salesOrders ?? []).map((so) => [so.id, so]));
    const customerById = new Map((customers ?? []).map((c) => [c.id, c.name]));
    const warehouseById = new Map((warehouses ?? []).map((w) => [w.id, w.name]));
    return (deliveries ?? []).map((delivery) => {
      const order = soById.get(delivery.salesOrderId);
      return {
        ...delivery,
        soNumber: order?.soNumber ?? '—',
        customerName: (order && customerById.get(order.customerId)) ?? '—',
        warehouseName: warehouseById.get(delivery.warehouseId) ?? '—',
      };
    });
  }, [deliveries, salesOrders, customers, warehouses]);

  const counts = useMemo(() => {
    const result: Partial<Record<StatusTab, number>> = { all: rows.length };
    for (const row of rows) result[row.status] = (result[row.status] ?? 0) + 1;
    return result;
  }, [rows]);

  const visibleRows = useMemo(
    () => (status === 'all' ? rows : rows.filter((row) => row.status === status)),
    [rows, status],
  );

  const columns = useMemo<ColumnDef<DeliveryRow>[]>(
    () => [
      {
        accessorKey: 'deliveryNumber',
        header: t('sales.deliveries.deliveryNumber'),
        cell: ({ row }) => <span className="font-medium tabular-nums">{row.original.deliveryNumber}</span>,
      },
      {
        id: 'deliveryDate',
        header: t('sales.deliveries.deliveryDate'),
        accessorFn: (row) => row.deliveryDate ?? '',
        cell: ({ row }) => <span className="tabular-nums">{formatDate(row.original.deliveryDate)}</span>,
      },
      {
        accessorKey: 'soNumber',
        header: t('sales.deliveries.salesOrder'),
        cell: ({ row }) => <span className="tabular-nums">{row.original.soNumber}</span>,
      },
      { accessorKey: 'customerName', header: t('sales.deliveries.customer') },
      {
        accessorKey: 'warehouseName',
        header: t('sales.deliveries.warehouse'),
        cell: ({ row }) => <span className="text-muted-foreground">{row.original.warehouseName}</span>,
      },
      {
        id: 'status',
        header: t('common.status'),
        accessorFn: (row) => t(deliveryStatusLabelKey(row.status)),
        cell: ({ row }) => (
          <Badge variant={DELIVERY_STATUS_VARIANT[row.original.status]} dot>
            {t(deliveryStatusLabelKey(row.original.status))}
          </Badge>
        ),
      },
    ],
    [t],
  );

  return (
    <div className="grid gap-5">
      <PageHeader
        title={t('sales.tabs.deliveries')}
        description={t('sales.deliveries.subtitle')}
        actions={
          <Can permission={SALES.create}>
            <Button asChild>
              <Link to={`${DELIVERIES_PATH}/new`}>
                <Plus className="me-1 h-4 w-4" />
                {t('sales.deliveries.newDelivery')}
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
        searchPlaceholder={t('sales.deliveries.search')}
        onRowClick={(delivery) => navigate(`${DELIVERIES_PATH}/${delivery.id}`)}
        toolbar={
          <StatusTabs
            tabs={STATUS_TABS}
            value={status}
            onChange={(tab) => setParams(tab === 'all' ? {} : { status: tab }, { replace: true })}
            label={(tab) => (tab === 'all' ? t('documents.all') : t(deliveryStatusLabelKey(tab)))}
            counts={counts}
          />
        }
      />
    </div>
  );
}

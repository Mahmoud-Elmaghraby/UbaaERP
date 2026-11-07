import { useMemo } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { ColumnDef } from '@tanstack/react-table';
import type { PurchaseOrderDto, PurchaseOrderStatusDto } from '@erp-platform/contracts';
import { Badge, Button, Can, DataTable, PageHeader } from '@erp-platform/ui';
import { Plus } from 'lucide-react';

import { useSuppliers } from '../../api/suppliers/queries';
import { usePurchaseOrders } from '../../api/purchase-orders/queries';
import { StatusTabs } from '../../../../components/list/status-tabs';
import { formatDate } from '../../../../lib/format-date';
import { PURCHASE_ORDER_STATUS_VARIANT, PURCHASE_ORDERS_PATH, purchaseOrderStatusLabelKey } from './purchase-order-status';

const STATUS_TABS = ['all', 'draft', 'confirmed', 'partially_received', 'fully_received', 'cancelled'] as const;
type StatusTab = (typeof STATUS_TABS)[number];
type Row = PurchaseOrderDto & { supplierName: string };

/** أوامر الشراء — status tabs and search; a row opens the order's page. */
export function PurchaseOrdersPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const rawStatus = params.get('status');
  const status: StatusTab = STATUS_TABS.includes(rawStatus as StatusTab) ? (rawStatus as StatusTab) : 'all';
  const { data: orders, isLoading } = usePurchaseOrders();
  const { data: suppliers } = useSuppliers();

  const rows = useMemo<Row[]>(() => {
    const nameById = new Map((suppliers ?? []).map((s) => [s.id, s.name]));
    return (orders ?? []).map((order) => ({ ...order, supplierName: nameById.get(order.supplierId) ?? '—' }));
  }, [orders, suppliers]);

  const counts = useMemo(() => {
    const result: Partial<Record<StatusTab, number>> = { all: rows.length };
    for (const row of rows) result[row.status] = (result[row.status] ?? 0) + 1;
    return result;
  }, [rows]);

  const visible = useMemo(() => (status === 'all' ? rows : rows.filter((r) => r.status === status)), [rows, status]);

  const columns = useMemo<ColumnDef<Row>[]>(
    () => [
      {
        accessorKey: 'poNumber',
        header: t('purchases.purchaseOrders.poNumber'),
        cell: ({ row }) => <span className="font-medium tabular-nums">{row.original.poNumber}</span>,
      },
      {
        id: 'date',
        header: t('documents.date'),
        accessorFn: (row) => formatDate(row.createdAt),
        cell: ({ getValue }) => <span className="tabular-nums">{String(getValue())}</span>,
      },
      { accessorKey: 'supplierName', header: t('purchases.purchaseOrders.supplier') },
      {
        id: 'expectedDeliveryDate',
        header: t('purchases.purchaseOrders.expectedDeliveryDate'),
        accessorFn: (row) => (row.expectedDeliveryDate ? formatDate(row.expectedDeliveryDate) : '—'),
        cell: ({ getValue }) => <span className="tabular-nums">{String(getValue())}</span>,
      },
      {
        id: 'status',
        header: t('common.status'),
        accessorFn: (row) => t(purchaseOrderStatusLabelKey(row.status)),
        cell: ({ row }) => (
          <Badge variant={PURCHASE_ORDER_STATUS_VARIANT[row.original.status]} dot>
            {t(purchaseOrderStatusLabelKey(row.original.status))}
          </Badge>
        ),
      },
    ],
    [t],
  );

  return (
    <div className="grid gap-5">
      <PageHeader
        title={t('purchases.tabs.purchaseOrders')}
        description={t('purchases.purchaseOrders.subtitle')}
        actions={
          <Can permission="purchases.manage">
            <Button asChild>
              <Link to={`${PURCHASE_ORDERS_PATH}/new`}>
                <Plus className="me-1 h-4 w-4" />
                {t('purchases.purchaseOrders.newOrder')}
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
        searchPlaceholder={t('purchases.purchaseOrders.search')}
        onRowClick={(row) => navigate(`${PURCHASE_ORDERS_PATH}/${row.id}`)}
        toolbar={
          <StatusTabs
            tabs={STATUS_TABS}
            value={status}
            onChange={(tab) => setParams(tab === 'all' ? {} : { status: tab }, { replace: true })}
            label={(tab) => (tab === 'all' ? t('documents.all') : t(purchaseOrderStatusLabelKey(tab as PurchaseOrderStatusDto)))}
            counts={counts}
          />
        }
      />
    </div>
  );
}

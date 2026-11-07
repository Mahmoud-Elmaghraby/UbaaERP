import { useMemo } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { ColumnDef } from '@tanstack/react-table';
import type { GoodsReceiptDto, GoodsReceiptStatusDto } from '@erp-platform/contracts';
import { Badge, Button, Can, DataTable, PageHeader } from '@erp-platform/ui';
import { Plus } from 'lucide-react';

import { useWarehouses } from '../../../inventory/api/warehouses/queries';
import { useSuppliers } from '../../api/suppliers/queries';
import { usePurchaseOrders } from '../../api/purchase-orders/queries';
import { useGoodsReceipts } from '../../api/goods-receipts/queries';
import { StatusTabs } from '../../../../components/list/status-tabs';
import { formatDate } from '../../../../lib/format-date';
import { GOODS_RECEIPT_STATUS_VARIANT, GOODS_RECEIPTS_PATH, goodsReceiptStatusLabelKey } from './goods-receipt-status';

const STATUS_TABS = ['all', 'draft', 'confirmed', 'cancelled'] as const;
type StatusTab = (typeof STATUS_TABS)[number];
type Row = GoodsReceiptDto & { poNumber: string; supplierName: string; warehouseName: string };

/** استلامات البضاعة — status tabs and search; a row opens the receipt's page. */
export function GoodsReceiptsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const rawStatus = params.get('status');
  const status: StatusTab = STATUS_TABS.includes(rawStatus as StatusTab) ? (rawStatus as StatusTab) : 'all';
  const { data: receipts, isLoading } = useGoodsReceipts();
  const { data: orders } = usePurchaseOrders();
  const { data: suppliers } = useSuppliers();
  const { data: warehouses } = useWarehouses();

  const rows = useMemo<Row[]>(() => {
    const orderById = new Map((orders ?? []).map((o) => [o.id, o]));
    const supplierName = new Map((suppliers ?? []).map((s) => [s.id, s.name]));
    const warehouseName = new Map((warehouses ?? []).map((w) => [w.id, w.name]));
    return (receipts ?? []).map((receipt) => {
      const order = orderById.get(receipt.purchaseOrderId);
      return {
        ...receipt,
        poNumber: order?.poNumber ?? '—',
        supplierName: (order && supplierName.get(order.supplierId)) ?? '—',
        warehouseName: warehouseName.get(receipt.warehouseId) ?? '—',
      };
    });
  }, [receipts, orders, suppliers, warehouses]);

  const counts = useMemo(() => {
    const result: Partial<Record<StatusTab, number>> = { all: rows.length };
    for (const row of rows) result[row.status] = (result[row.status] ?? 0) + 1;
    return result;
  }, [rows]);

  const visible = useMemo(() => (status === 'all' ? rows : rows.filter((r) => r.status === status)), [rows, status]);

  const columns = useMemo<ColumnDef<Row>[]>(
    () => [
      {
        accessorKey: 'receiptNumber',
        header: t('purchases.goodsReceipts.receiptNumber'),
        cell: ({ row }) => <span className="font-medium tabular-nums">{row.original.receiptNumber}</span>,
      },
      {
        id: 'date',
        header: t('purchases.goodsReceipts.receivedDate'),
        accessorFn: (row) => formatDate(row.receivedDate ?? row.createdAt),
        cell: ({ getValue }) => <span className="tabular-nums">{String(getValue())}</span>,
      },
      {
        accessorKey: 'poNumber',
        header: t('purchases.goodsReceipts.purchaseOrder'),
        cell: ({ row }) => <span className="tabular-nums">{row.original.poNumber}</span>,
      },
      { accessorKey: 'supplierName', header: t('purchases.purchaseOrders.supplier') },
      { accessorKey: 'warehouseName', header: t('purchases.goodsReceipts.warehouse') },
      {
        id: 'status',
        header: t('common.status'),
        accessorFn: (row) => t(goodsReceiptStatusLabelKey(row.status)),
        cell: ({ row }) => (
          <Badge variant={GOODS_RECEIPT_STATUS_VARIANT[row.original.status]} dot>
            {t(goodsReceiptStatusLabelKey(row.original.status))}
          </Badge>
        ),
      },
    ],
    [t],
  );

  return (
    <div className="grid gap-5">
      <PageHeader
        title={t('purchases.tabs.goodsReceipts')}
        description={t('purchases.goodsReceipts.subtitle')}
        actions={
          <Can permission="purchases.manage">
            <Button asChild>
              <Link to={`${GOODS_RECEIPTS_PATH}/new`}>
                <Plus className="me-1 h-4 w-4" />
                {t('purchases.goodsReceipts.newReceipt')}
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
        searchPlaceholder={t('purchases.goodsReceipts.search')}
        onRowClick={(row) => navigate(`${GOODS_RECEIPTS_PATH}/${row.id}`)}
        toolbar={
          <StatusTabs
            tabs={STATUS_TABS}
            value={status}
            onChange={(tab) => setParams(tab === 'all' ? {} : { status: tab }, { replace: true })}
            label={(tab) => (tab === 'all' ? t('documents.all') : t(goodsReceiptStatusLabelKey(tab as GoodsReceiptStatusDto)))}
            counts={counts}
          />
        }
      />
    </div>
  );
}

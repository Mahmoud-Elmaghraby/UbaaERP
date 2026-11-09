import { useMemo } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { ColumnDef } from '@tanstack/react-table';
import type { PurchaseReturnDto, PurchaseReturnStatusDto } from '@erp-platform/contracts';
import { Badge, Button, Can, DataTable, PageHeader } from '@erp-platform/ui';
import { Plus } from 'lucide-react';

import { useGoodsReceipts } from '../../api/goods-receipts/queries';
import { usePurchaseOrders } from '../../api/purchase-orders/queries';
import { usePurchaseReturns } from '../../api/purchase-returns/queries';
import { useSuppliers } from '../../api/suppliers/queries';
import { StatusTabs } from '../../../../components/list/status-tabs';
import { formatDate } from '../../../../lib/format-date';
import { PURCHASE_RETURN_STATUS_VARIANT, PURCHASE_RETURNS_PATH, purchaseReturnStatusLabelKey } from './purchase-return-status';
import { PURCH } from '../../../../lib/permissions';

const STATUS_TABS = ['all', 'draft', 'confirmed', 'cancelled'] as const;
type StatusTab = (typeof STATUS_TABS)[number];
type Row = PurchaseReturnDto & { receiptNumber: string; supplierName: string };

/** مرتجعات المشتريات — status tabs and search; a row opens the return's page. */
export function PurchaseReturnsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const rawStatus = params.get('status');
  const status: StatusTab = STATUS_TABS.includes(rawStatus as StatusTab) ? (rawStatus as StatusTab) : 'all';
  const { data: returns, isLoading } = usePurchaseReturns();
  const { data: receipts } = useGoodsReceipts();
  const { data: orders } = usePurchaseOrders();
  const { data: suppliers } = useSuppliers();

  const rows = useMemo<Row[]>(() => {
    const receiptById = new Map((receipts ?? []).map((r) => [r.id, r]));
    const orderById = new Map((orders ?? []).map((o) => [o.id, o]));
    const supplierName = new Map((suppliers ?? []).map((s) => [s.id, s.name]));
    return (returns ?? []).map((r) => {
      const receipt = receiptById.get(r.goodsReceiptId);
      const order = receipt ? orderById.get(receipt.purchaseOrderId) : undefined;
      return {
        ...r,
        receiptNumber: receipt?.receiptNumber ?? '—',
        supplierName: (order && supplierName.get(order.supplierId)) ?? '—',
      };
    });
  }, [returns, receipts, orders, suppliers]);

  const counts = useMemo(() => {
    const result: Partial<Record<StatusTab, number>> = { all: rows.length };
    for (const row of rows) result[row.status] = (result[row.status] ?? 0) + 1;
    return result;
  }, [rows]);

  const visible = useMemo(() => (status === 'all' ? rows : rows.filter((r) => r.status === status)), [rows, status]);

  const columns = useMemo<ColumnDef<Row>[]>(
    () => [
      {
        accessorKey: 'returnNumber',
        header: t('purchases.purchaseReturns.returnNumber'),
        cell: ({ row }) => <span className="font-medium tabular-nums">{row.original.returnNumber}</span>,
      },
      {
        id: 'date',
        header: t('purchases.purchaseReturns.returnDate'),
        accessorFn: (row) => formatDate(row.returnDate ?? row.createdAt),
        cell: ({ getValue }) => <span className="tabular-nums">{String(getValue())}</span>,
      },
      {
        accessorKey: 'receiptNumber',
        header: t('purchases.purchaseReturns.goodsReceipt'),
        cell: ({ row }) => <span className="tabular-nums">{row.original.receiptNumber}</span>,
      },
      { accessorKey: 'supplierName', header: t('purchases.purchaseOrders.supplier') },
      {
        id: 'status',
        header: t('common.status'),
        accessorFn: (row) => t(purchaseReturnStatusLabelKey(row.status)),
        cell: ({ row }) => (
          <Badge variant={PURCHASE_RETURN_STATUS_VARIANT[row.original.status]} dot>
            {t(purchaseReturnStatusLabelKey(row.original.status))}
          </Badge>
        ),
      },
    ],
    [t],
  );

  return (
    <div className="grid gap-5">
      <PageHeader
        title={t('purchases.tabs.purchaseReturns')}
        description={t('purchases.purchaseReturns.subtitle')}
        actions={
          <Can permission={PURCH.create}>
            <Button asChild>
              <Link to={`${PURCHASE_RETURNS_PATH}/new`}>
                <Plus className="me-1 h-4 w-4" />
                {t('purchases.purchaseReturns.newReturn')}
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
        searchPlaceholder={t('purchases.purchaseReturns.search')}
        onRowClick={(row) => navigate(`${PURCHASE_RETURNS_PATH}/${row.id}`)}
        toolbar={
          <StatusTabs
            tabs={STATUS_TABS}
            value={status}
            onChange={(tab) => setParams(tab === 'all' ? {} : { status: tab }, { replace: true })}
            label={(tab) => (tab === 'all' ? t('documents.all') : t(purchaseReturnStatusLabelKey(tab as PurchaseReturnStatusDto)))}
            counts={counts}
          />
        }
      />
    </div>
  );
}

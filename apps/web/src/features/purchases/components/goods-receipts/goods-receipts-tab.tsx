import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MoreHorizontal } from 'lucide-react';
import type { ColumnDef, Row } from '@tanstack/react-table';
import type { GoodsReceiptDto } from '@erp-platform/contracts';
import {
  Badge,
  Button,
  Can,
  DataTable,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Skeleton,
  toast,
} from '@erp-platform/ui';

import { usePurchaseOrders } from '../../api/purchase-orders/queries';
import {
  useCancelGoodsReceipt,
  useConfirmGoodsReceipt,
  useDeleteGoodsReceipt,
  useGoodsReceipt,
  useGoodsReceipts,
} from '../../api/goods-receipts/queries';
import { CreateGoodsReceiptForm } from './goods-receipt-form';
import { GoodsReceiptDetailsView } from './goods-receipt-details-view';
import { GOODS_RECEIPT_STATUS_VARIANT, goodsReceiptStatusLabelKey } from './goods-receipt-status';
import { ApiError } from '../../../../lib/api-client';

export function GoodsReceiptsTab() {
  const { t } = useTranslation();
  const { data: receipts, isLoading } = useGoodsReceipts();
  const { data: purchaseOrders } = usePurchaseOrders();
  const [createOpen, setCreateOpen] = useState(false);
  const [viewingId, setViewingId] = useState<string | null>(null);

  const { data: viewingReceipt, isLoading: viewingLoading } = useGoodsReceipt(viewingId);

  const confirmReceipt = useConfirmGoodsReceipt();
  const cancelReceipt = useCancelGoodsReceipt();
  const deleteReceipt = useDeleteGoodsReceipt();

  const poById = useMemo(() => new Map((purchaseOrders ?? []).map((po) => [po.id, po])), [purchaseOrders]);

  async function handleTransition(
    mutation: { mutateAsync: (id: string) => Promise<unknown> },
    id: string,
    successKey: string,
    errorKey: string,
  ) {
    try {
      await mutation.mutateAsync(id);
      toast.success(t(successKey));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t(errorKey));
    }
  }

  async function handleConfirm(id: string) {
    if (!window.confirm(t('purchases.goodsReceipts.confirmConfirm'))) return;
    await handleTransition(
      confirmReceipt,
      id,
      'purchases.goodsReceipts.confirmSuccess',
      'purchases.goodsReceipts.confirmError',
    );
  }

  async function handleCancel(id: string) {
    if (!window.confirm(t('purchases.goodsReceipts.cancelConfirm'))) return;
    await handleTransition(
      cancelReceipt,
      id,
      'purchases.goodsReceipts.cancelSuccess',
      'purchases.goodsReceipts.cancelError',
    );
  }

  async function handleDelete(id: string) {
    if (!window.confirm(t('purchases.goodsReceipts.deleteConfirm'))) return;
    try {
      await deleteReceipt.mutateAsync(id);
      toast.success(t('purchases.goodsReceipts.deleteSuccess'));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('common.error'));
    }
  }

  const columns = useMemo<ColumnDef<GoodsReceiptDto>[]>(
    () => [
      { accessorKey: 'receiptNumber', header: t('purchases.goodsReceipts.receiptNumber') },
      {
        id: 'status',
        header: t('common.status'),
        accessorFn: (row: GoodsReceiptDto) => row.status,
        cell: ({ row }: { row: Row<GoodsReceiptDto> }) => (
          <Badge variant={GOODS_RECEIPT_STATUS_VARIANT[row.original.status]}>
            {t(goodsReceiptStatusLabelKey(row.original.status))}
          </Badge>
        ),
      },
      {
        id: 'purchaseOrder',
        header: t('purchases.goodsReceipts.purchaseOrder'),
        accessorFn: (row: GoodsReceiptDto) => poById.get(row.purchaseOrderId)?.poNumber ?? '—',
      },
      {
        id: 'receivedDate',
        header: t('purchases.goodsReceipts.receivedDate'),
        accessorFn: (row: GoodsReceiptDto) => row.receivedDate ?? '—',
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }: { row: Row<GoodsReceiptDto> }) => {
          const receipt = row.original;
          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => setViewingId(receipt.id)}>
                  {t('purchases.goodsReceipts.viewDetails')}
                </DropdownMenuItem>
                <Can permission="purchases.manage">
                  <>
                    {receipt.status === 'draft' ? (
                      <DropdownMenuItem onSelect={() => handleConfirm(receipt.id)}>
                        {t('purchases.goodsReceipts.confirm')}
                      </DropdownMenuItem>
                    ) : null}
                    {receipt.status === 'draft' ? (
                      <DropdownMenuItem onSelect={() => handleCancel(receipt.id)}>
                        {t('purchases.goodsReceipts.cancel')}
                      </DropdownMenuItem>
                    ) : null}
                    {receipt.status === 'draft' || receipt.status === 'cancelled' ? (
                      <DropdownMenuItem onSelect={() => handleDelete(receipt.id)}>
                        {t('common.delete')}
                      </DropdownMenuItem>
                    ) : null}
                  </>
                </Can>
              </DropdownMenuContent>
            </DropdownMenu>
          );
        },
      },
    ],
    [t, poById],
  );

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">{t('purchases.goodsReceipts.subtitle')}</p>
        <Can permission="purchases.manage">
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            {t('purchases.goodsReceipts.newReceipt')}
          </Button>
        </Can>
      </div>

      <DataTable columns={columns} data={receipts ?? []} isLoading={isLoading} />

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{t('purchases.goodsReceipts.newReceipt')}</DialogTitle>
          </DialogHeader>
          <CreateGoodsReceiptForm onDone={() => setCreateOpen(false)} />
        </DialogContent>
      </Dialog>

      <Dialog open={viewingId !== null} onOpenChange={(open) => !open && setViewingId(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{t('purchases.goodsReceipts.viewDetails')}</DialogTitle>
          </DialogHeader>
          {viewingLoading ? <Skeleton className="h-40 w-full" /> : null}
          {viewingReceipt ? <GoodsReceiptDetailsView receipt={viewingReceipt} /> : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

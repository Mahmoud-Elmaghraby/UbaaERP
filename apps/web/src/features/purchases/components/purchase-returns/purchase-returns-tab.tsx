import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MoreHorizontal } from 'lucide-react';
import type { ColumnDef, Row } from '@tanstack/react-table';
import type { PurchaseReturnDto } from '@erp-platform/contracts';
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

import { useGoodsReceipts } from '../../api/goods-receipts/queries';
import {
  useCancelPurchaseReturn,
  useConfirmPurchaseReturn,
  useDeletePurchaseReturn,
  usePurchaseReturn,
  usePurchaseReturns,
} from '../../api/purchase-returns/queries';
import { CreatePurchaseReturnForm } from './purchase-return-form';
import { PurchaseReturnDetailsView } from './purchase-return-details-view';
import {
  PURCHASE_RETURN_STATUS_VARIANT,
  purchaseReturnStatusLabelKey,
} from './purchase-return-status';
import { ApiError } from '../../../../lib/api-client';

export function PurchaseReturnsTab() {
  const { t } = useTranslation();
  const { data: returns, isLoading } = usePurchaseReturns();
  const { data: goodsReceipts } = useGoodsReceipts();
  const [createOpen, setCreateOpen] = useState(false);
  const [viewingId, setViewingId] = useState<string | null>(null);

  const { data: viewingReturn, isLoading: viewingLoading } = usePurchaseReturn(viewingId);

  const confirmReturn = useConfirmPurchaseReturn();
  const cancelReturn = useCancelPurchaseReturn();
  const deleteReturn = useDeletePurchaseReturn();

  const receiptById = useMemo(
    () => new Map((goodsReceipts ?? []).map((r) => [r.id, r])),
    [goodsReceipts],
  );

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
    if (!window.confirm(t('purchases.purchaseReturns.confirmConfirm'))) return;
    await handleTransition(
      confirmReturn,
      id,
      'purchases.purchaseReturns.confirmSuccess',
      'purchases.purchaseReturns.confirmError',
    );
  }

  async function handleCancel(id: string) {
    if (!window.confirm(t('purchases.purchaseReturns.cancelConfirm'))) return;
    await handleTransition(
      cancelReturn,
      id,
      'purchases.purchaseReturns.cancelSuccess',
      'purchases.purchaseReturns.cancelError',
    );
  }

  async function handleDelete(id: string) {
    if (!window.confirm(t('purchases.purchaseReturns.deleteConfirm'))) return;
    try {
      await deleteReturn.mutateAsync(id);
      toast.success(t('purchases.purchaseReturns.deleteSuccess'));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('common.error'));
    }
  }

  const columns = useMemo<ColumnDef<PurchaseReturnDto>[]>(
    () => [
      { accessorKey: 'returnNumber', header: t('purchases.purchaseReturns.returnNumber') },
      {
        id: 'status',
        header: t('common.status'),
        accessorFn: (row: PurchaseReturnDto) => row.status,
        cell: ({ row }: { row: Row<PurchaseReturnDto> }) => (
          <Badge variant={PURCHASE_RETURN_STATUS_VARIANT[row.original.status]} dot>
            {t(purchaseReturnStatusLabelKey(row.original.status))}
          </Badge>
        ),
      },
      {
        id: 'goodsReceipt',
        header: t('purchases.purchaseReturns.goodsReceipt'),
        accessorFn: (row: PurchaseReturnDto) =>
          receiptById.get(row.goodsReceiptId)?.receiptNumber ?? '—',
      },
      {
        id: 'returnDate',
        header: t('purchases.purchaseReturns.returnDate'),
        accessorFn: (row: PurchaseReturnDto) => row.returnDate ?? '—',
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }: { row: Row<PurchaseReturnDto> }) => {
          const purchaseReturn = row.original;
          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => setViewingId(purchaseReturn.id)}>
                  {t('purchases.purchaseReturns.viewDetails')}
                </DropdownMenuItem>
                <Can permission="purchases.manage">
                  <>
                    {purchaseReturn.status === 'draft' ? (
                      <DropdownMenuItem onSelect={() => handleConfirm(purchaseReturn.id)}>
                        {t('purchases.purchaseReturns.confirm')}
                      </DropdownMenuItem>
                    ) : null}
                    {purchaseReturn.status === 'draft' ? (
                      <DropdownMenuItem onSelect={() => handleCancel(purchaseReturn.id)}>
                        {t('purchases.purchaseReturns.cancel')}
                      </DropdownMenuItem>
                    ) : null}
                    {purchaseReturn.status === 'draft' || purchaseReturn.status === 'cancelled' ? (
                      <DropdownMenuItem onSelect={() => handleDelete(purchaseReturn.id)}>
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
    [t, receiptById],
  );

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Can permission="purchases.manage">
          <Button onClick={() => setCreateOpen(true)}>
            {t('purchases.purchaseReturns.newReturn')}
          </Button>
        </Can>
      </div>

      <DataTable columns={columns} data={returns ?? []} isLoading={isLoading} />

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{t('purchases.purchaseReturns.newReturn')}</DialogTitle>
          </DialogHeader>
          <CreatePurchaseReturnForm onDone={() => setCreateOpen(false)} />
        </DialogContent>
      </Dialog>

      <Dialog open={viewingId !== null} onOpenChange={(open) => !open && setViewingId(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{t('purchases.purchaseReturns.viewDetails')}</DialogTitle>
          </DialogHeader>
          {viewingLoading ? <Skeleton className="h-40 w-full" /> : null}
          {viewingReturn ? <PurchaseReturnDetailsView purchaseReturn={viewingReturn} /> : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

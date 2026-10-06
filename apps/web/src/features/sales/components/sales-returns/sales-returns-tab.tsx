import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MoreHorizontal } from 'lucide-react';
import type { ColumnDef, Row } from '@tanstack/react-table';
import type { SalesReturnDto } from '@erp-platform/contracts';
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

import { useDeliveries } from '../../api/deliveries/queries';
import {
  useCancelSalesReturn,
  useConfirmSalesReturn,
  useDeleteSalesReturn,
  useSalesReturn,
  useSalesReturns,
} from '../../api/sales-returns/queries';
import { CreateSalesReturnForm } from './sales-return-form';
import { SalesReturnDetailsView } from './sales-return-details-view';
import { SALES_RETURN_STATUS_VARIANT, salesReturnStatusLabelKey } from './sales-return-status';
import { ApiError } from '../../../../lib/api-client';

export function SalesReturnsTab() {
  const { t } = useTranslation();
  const { data: returns, isLoading } = useSalesReturns();
  const { data: deliveries } = useDeliveries();
  const [createOpen, setCreateOpen] = useState(false);
  const [viewingId, setViewingId] = useState<string | null>(null);

  const { data: viewingReturn, isLoading: viewingLoading } = useSalesReturn(viewingId);

  const confirmReturn = useConfirmSalesReturn();
  const cancelReturn = useCancelSalesReturn();
  const deleteReturn = useDeleteSalesReturn();

  const deliveryById = useMemo(
    () => new Map((deliveries ?? []).map((d) => [d.id, d])),
    [deliveries],
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
    if (!window.confirm(t('sales.salesReturns.confirmConfirm'))) return;
    // confirm() auto-generates a Sales Credit Note in the same transaction (migration
    // 0053) — surface that in the success toast rather than a generic message, since
    // it's the one status transition in this module with a real financial side effect
    // the user can't see from this table alone.
    try {
      await confirmReturn.mutateAsync(id);
      toast.success(t('sales.salesReturns.confirmSuccessWithCreditNote'));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('sales.salesReturns.confirmError'));
    }
  }

  async function handleCancel(id: string) {
    if (!window.confirm(t('sales.salesReturns.cancelConfirm'))) return;
    await handleTransition(
      cancelReturn,
      id,
      'sales.salesReturns.cancelSuccess',
      'sales.salesReturns.cancelError',
    );
  }

  async function handleDelete(id: string) {
    if (!window.confirm(t('sales.salesReturns.deleteConfirm'))) return;
    try {
      await deleteReturn.mutateAsync(id);
      toast.success(t('sales.salesReturns.deleteSuccess'));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('common.error'));
    }
  }

  const columns = useMemo<ColumnDef<SalesReturnDto>[]>(
    () => [
      { accessorKey: 'returnNumber', header: t('sales.salesReturns.returnNumber') },
      {
        id: 'status',
        header: t('common.status'),
        accessorFn: (row: SalesReturnDto) => row.status,
        cell: ({ row }: { row: Row<SalesReturnDto> }) => (
          <Badge variant={SALES_RETURN_STATUS_VARIANT[row.original.status]} dot>
            {t(salesReturnStatusLabelKey(row.original.status))}
          </Badge>
        ),
      },
      {
        id: 'delivery',
        header: t('sales.salesReturns.delivery'),
        accessorFn: (row: SalesReturnDto) =>
          deliveryById.get(row.deliveryId)?.deliveryNumber ?? '—',
      },
      {
        id: 'returnDate',
        header: t('sales.salesReturns.returnDate'),
        accessorFn: (row: SalesReturnDto) => row.returnDate ?? '—',
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }: { row: Row<SalesReturnDto> }) => {
          const salesReturn = row.original;
          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => setViewingId(salesReturn.id)}>
                  {t('sales.salesReturns.viewDetails')}
                </DropdownMenuItem>
                <Can permission="sales.manage">
                  <>
                    {salesReturn.status === 'draft' ? (
                      <DropdownMenuItem onSelect={() => handleConfirm(salesReturn.id)}>
                        {t('sales.salesReturns.confirm')}
                      </DropdownMenuItem>
                    ) : null}
                    {salesReturn.status === 'draft' ? (
                      <DropdownMenuItem onSelect={() => handleCancel(salesReturn.id)}>
                        {t('sales.salesReturns.cancel')}
                      </DropdownMenuItem>
                    ) : null}
                    {salesReturn.status === 'draft' || salesReturn.status === 'cancelled' ? (
                      <DropdownMenuItem onSelect={() => handleDelete(salesReturn.id)}>
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
    [t, deliveryById],
  );

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Can permission="sales.manage">
          <Button onClick={() => setCreateOpen(true)}>
            {t('sales.salesReturns.newReturn')}
          </Button>
        </Can>
      </div>

      <DataTable columns={columns} data={returns ?? []} isLoading={isLoading} />

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{t('sales.salesReturns.newReturn')}</DialogTitle>
          </DialogHeader>
          <CreateSalesReturnForm onDone={() => setCreateOpen(false)} />
        </DialogContent>
      </Dialog>

      <Dialog open={viewingId !== null} onOpenChange={(open) => !open && setViewingId(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{t('sales.salesReturns.viewDetails')}</DialogTitle>
          </DialogHeader>
          {viewingLoading ? <Skeleton className="h-40 w-full" /> : null}
          {viewingReturn ? <SalesReturnDetailsView salesReturn={viewingReturn} /> : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

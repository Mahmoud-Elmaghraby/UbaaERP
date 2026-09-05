import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MoreHorizontal } from 'lucide-react';
import type { ColumnDef, Row } from '@tanstack/react-table';
import type { PurchaseOrderDto } from '@erp-platform/contracts';
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

import { useSuppliers } from '../../api/suppliers/queries';
import {
  useCancelPurchaseOrder,
  useConfirmPurchaseOrder,
  useDeletePurchaseOrder,
  usePurchaseOrder,
  usePurchaseOrders,
} from '../../api/purchase-orders/queries';
import { CreatePurchaseOrderTabs, EditPurchaseOrderForm } from './purchase-order-form';
import { PurchaseOrderDetailsView } from './purchase-order-details-view';
import { PURCHASE_ORDER_STATUS_VARIANT, purchaseOrderStatusLabelKey } from './purchase-order-status';
import { ApiError } from '../../../../lib/api-client';

export function PurchaseOrdersTab() {
  const { t } = useTranslation();
  const { data: orders, isLoading } = usePurchaseOrders();
  const { data: suppliers } = useSuppliers();
  const [createOpen, setCreateOpen] = useState(false);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const { data: viewingOrder, isLoading: viewingLoading } = usePurchaseOrder(viewingId);
  const { data: editingOrder, isLoading: editingLoading } = usePurchaseOrder(editingId);

  const confirmOrder = useConfirmPurchaseOrder();
  const cancelOrder = useCancelPurchaseOrder();
  const deleteOrder = useDeletePurchaseOrder();

  const supplierById = useMemo(() => new Map((suppliers ?? []).map((s) => [s.id, s])), [suppliers]);

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
    await handleTransition(
      confirmOrder,
      id,
      'purchases.purchaseOrders.confirmSuccess',
      'purchases.purchaseOrders.confirmError',
    );
  }

  async function handleCancel(id: string) {
    if (!window.confirm(t('purchases.purchaseOrders.cancelConfirm'))) return;
    await handleTransition(
      cancelOrder,
      id,
      'purchases.purchaseOrders.cancelSuccess',
      'purchases.purchaseOrders.cancelError',
    );
  }

  async function handleDelete(id: string) {
    if (!window.confirm(t('purchases.purchaseOrders.deleteConfirm'))) return;
    try {
      await deleteOrder.mutateAsync(id);
      toast.success(t('purchases.purchaseOrders.deleteSuccess'));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('common.error'));
    }
  }

  const columns = useMemo<ColumnDef<PurchaseOrderDto>[]>(
    () => [
      { accessorKey: 'poNumber', header: t('purchases.purchaseOrders.poNumber') },
      {
        id: 'status',
        header: t('common.status'),
        accessorFn: (row: PurchaseOrderDto) => row.status,
        cell: ({ row }: { row: Row<PurchaseOrderDto> }) => (
          <Badge variant={PURCHASE_ORDER_STATUS_VARIANT[row.original.status]}>
            {t(purchaseOrderStatusLabelKey(row.original.status))}
          </Badge>
        ),
      },
      {
        id: 'supplier',
        header: t('purchases.purchaseOrders.supplier'),
        accessorFn: (row: PurchaseOrderDto) => supplierById.get(row.supplierId)?.name ?? '—',
      },
      {
        id: 'expectedDeliveryDate',
        header: t('purchases.purchaseOrders.expectedDeliveryDate'),
        accessorFn: (row: PurchaseOrderDto) => row.expectedDeliveryDate ?? '—',
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }: { row: Row<PurchaseOrderDto> }) => {
          const order = row.original;
          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => setViewingId(order.id)}>
                  {t('purchases.purchaseOrders.viewDetails')}
                </DropdownMenuItem>
                <Can permission="purchases.manage">
                  <>
                    {order.status === 'draft' ? (
                      <DropdownMenuItem onSelect={() => setEditingId(order.id)}>{t('common.edit')}</DropdownMenuItem>
                    ) : null}
                    {order.status === 'draft' ? (
                      <DropdownMenuItem onSelect={() => handleConfirm(order.id)}>
                        {t('purchases.purchaseOrders.confirm')}
                      </DropdownMenuItem>
                    ) : null}
                    {order.status === 'draft' || order.status === 'confirmed' ? (
                      <DropdownMenuItem onSelect={() => handleCancel(order.id)}>
                        {t('purchases.purchaseOrders.cancel')}
                      </DropdownMenuItem>
                    ) : null}
                    {order.status === 'draft' || order.status === 'cancelled' ? (
                      <DropdownMenuItem onSelect={() => handleDelete(order.id)}>
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
    [t, supplierById],
  );

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">{t('purchases.purchaseOrders.subtitle')}</p>
        <Can permission="purchases.manage">
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            {t('purchases.purchaseOrders.newOrder')}
          </Button>
        </Can>
      </div>

      <DataTable columns={columns} data={orders ?? []} isLoading={isLoading} />

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{t('purchases.purchaseOrders.newOrder')}</DialogTitle>
          </DialogHeader>
          <CreatePurchaseOrderTabs onDone={() => setCreateOpen(false)} />
        </DialogContent>
      </Dialog>

      <Dialog open={viewingId !== null} onOpenChange={(open) => !open && setViewingId(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{t('purchases.purchaseOrders.viewDetails')}</DialogTitle>
          </DialogHeader>
          {viewingLoading ? <Skeleton className="h-40 w-full" /> : null}
          {viewingOrder ? <PurchaseOrderDetailsView order={viewingOrder} /> : null}
        </DialogContent>
      </Dialog>

      <Dialog open={editingId !== null} onOpenChange={(open) => !open && setEditingId(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{t('common.edit')}</DialogTitle>
          </DialogHeader>
          {editingLoading ? <Skeleton className="h-40 w-full" /> : null}
          {editingOrder ? <EditPurchaseOrderForm order={editingOrder} onDone={() => setEditingId(null)} /> : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

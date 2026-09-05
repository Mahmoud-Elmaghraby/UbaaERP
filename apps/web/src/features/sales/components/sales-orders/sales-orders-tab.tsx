import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MoreHorizontal } from 'lucide-react';
import type { ColumnDef, Row } from '@tanstack/react-table';
import type { SalesOrderDto } from '@erp-platform/contracts';
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

import { useCustomers } from '../../api/customers/queries';
import {
  useCancelSalesOrder,
  useConfirmSalesOrder,
  useDeleteSalesOrder,
  useSalesOrder,
  useSalesOrders,
} from '../../api/sales-orders/queries';
import { CreateSalesOrderTabs, EditSalesOrderForm } from './sales-order-form';
import { SalesOrderDetailsView } from './sales-order-details-view';
import { SALES_ORDER_STATUS_VARIANT, salesOrderStatusLabelKey } from './sales-order-status';
import { ApiError } from '../../../../lib/api-client';

export function SalesOrdersTab() {
  const { t } = useTranslation();
  const { data: orders, isLoading } = useSalesOrders();
  const { data: customers } = useCustomers();
  const [createOpen, setCreateOpen] = useState(false);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const { data: viewingOrder, isLoading: viewingLoading } = useSalesOrder(viewingId);
  const { data: editingOrder, isLoading: editingLoading } = useSalesOrder(editingId);

  const confirmOrder = useConfirmSalesOrder();
  const cancelOrder = useCancelSalesOrder();
  const deleteOrder = useDeleteSalesOrder();

  const customerById = useMemo(() => new Map((customers ?? []).map((c) => [c.id, c])), [customers]);

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
      'sales.salesOrders.confirmSuccess',
      'sales.salesOrders.confirmError',
    );
  }

  async function handleCancel(id: string) {
    if (!window.confirm(t('sales.salesOrders.cancelConfirm'))) return;
    await handleTransition(
      cancelOrder,
      id,
      'sales.salesOrders.cancelSuccess',
      'sales.salesOrders.cancelError',
    );
  }

  async function handleDelete(id: string) {
    if (!window.confirm(t('sales.salesOrders.deleteConfirm'))) return;
    try {
      await deleteOrder.mutateAsync(id);
      toast.success(t('sales.salesOrders.deleteSuccess'));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('common.error'));
    }
  }

  const columns = useMemo<ColumnDef<SalesOrderDto>[]>(
    () => [
      { accessorKey: 'soNumber', header: t('sales.salesOrders.soNumber') },
      {
        id: 'status',
        header: t('common.status'),
        accessorFn: (row: SalesOrderDto) => row.status,
        cell: ({ row }: { row: Row<SalesOrderDto> }) => (
          <Badge variant={SALES_ORDER_STATUS_VARIANT[row.original.status]}>
            {t(salesOrderStatusLabelKey(row.original.status))}
          </Badge>
        ),
      },
      {
        id: 'customer',
        header: t('sales.salesOrders.customer'),
        accessorFn: (row: SalesOrderDto) => customerById.get(row.customerId)?.name ?? '—',
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }: { row: Row<SalesOrderDto> }) => {
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
                  {t('sales.salesOrders.viewDetails')}
                </DropdownMenuItem>
                <Can permission="sales.manage">
                  <>
                    {order.status === 'draft' ? (
                      <DropdownMenuItem onSelect={() => setEditingId(order.id)}>{t('common.edit')}</DropdownMenuItem>
                    ) : null}
                    {order.status === 'draft' ? (
                      <DropdownMenuItem onSelect={() => handleConfirm(order.id)}>
                        {t('sales.salesOrders.confirm')}
                      </DropdownMenuItem>
                    ) : null}
                    {order.status === 'draft' || order.status === 'confirmed' ? (
                      <DropdownMenuItem onSelect={() => handleCancel(order.id)}>
                        {t('sales.salesOrders.cancel')}
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
    [t, customerById],
  );

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">{t('sales.salesOrders.subtitle')}</p>
        <Can permission="sales.manage">
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            {t('sales.salesOrders.newOrder')}
          </Button>
        </Can>
      </div>

      <DataTable columns={columns} data={orders ?? []} isLoading={isLoading} />

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{t('sales.salesOrders.newOrder')}</DialogTitle>
          </DialogHeader>
          <CreateSalesOrderTabs onDone={() => setCreateOpen(false)} />
        </DialogContent>
      </Dialog>

      <Dialog open={viewingId !== null} onOpenChange={(open) => !open && setViewingId(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{t('sales.salesOrders.viewDetails')}</DialogTitle>
          </DialogHeader>
          {viewingLoading ? <Skeleton className="h-40 w-full" /> : null}
          {viewingOrder ? <SalesOrderDetailsView order={viewingOrder} /> : null}
        </DialogContent>
      </Dialog>

      <Dialog open={editingId !== null} onOpenChange={(open) => !open && setEditingId(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{t('common.edit')}</DialogTitle>
          </DialogHeader>
          {editingLoading ? <Skeleton className="h-40 w-full" /> : null}
          {editingOrder ? <EditSalesOrderForm order={editingOrder} onDone={() => setEditingId(null)} /> : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

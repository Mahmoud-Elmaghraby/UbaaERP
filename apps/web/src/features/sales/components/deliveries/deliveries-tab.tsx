import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MoreHorizontal } from 'lucide-react';
import type { ColumnDef, Row } from '@tanstack/react-table';
import type { DeliveryDto } from '@erp-platform/contracts';
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

import { useSalesOrders } from '../../api/sales-orders/queries';
import {
  useCancelDelivery,
  useConfirmDelivery,
  useDeleteDelivery,
  useDelivery,
  useDeliveries,
} from '../../api/deliveries/queries';
import { CreateDeliveryForm } from './delivery-form';
import { DeliveryDetailsView } from './delivery-details-view';
import { DELIVERY_STATUS_VARIANT, deliveryStatusLabelKey } from './delivery-status';
import { ApiError } from '../../../../lib/api-client';

export function DeliveriesTab() {
  const { t } = useTranslation();
  const { data: deliveries, isLoading } = useDeliveries();
  const { data: salesOrders } = useSalesOrders();
  const [createOpen, setCreateOpen] = useState(false);
  const [viewingId, setViewingId] = useState<string | null>(null);

  const { data: viewingDelivery, isLoading: viewingLoading } = useDelivery(viewingId);

  const confirmDelivery = useConfirmDelivery();
  const cancelDelivery = useCancelDelivery();
  const deleteDelivery = useDeleteDelivery();

  const soById = useMemo(() => new Map((salesOrders ?? []).map((so) => [so.id, so])), [salesOrders]);

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
    if (!window.confirm(t('sales.deliveries.confirmConfirm'))) return;
    await handleTransition(
      confirmDelivery,
      id,
      'sales.deliveries.confirmSuccess',
      'sales.deliveries.confirmError',
    );
  }

  async function handleCancel(id: string) {
    if (!window.confirm(t('sales.deliveries.cancelConfirm'))) return;
    await handleTransition(
      cancelDelivery,
      id,
      'sales.deliveries.cancelSuccess',
      'sales.deliveries.cancelError',
    );
  }

  async function handleDelete(id: string) {
    if (!window.confirm(t('sales.deliveries.deleteConfirm'))) return;
    try {
      await deleteDelivery.mutateAsync(id);
      toast.success(t('sales.deliveries.deleteSuccess'));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('common.error'));
    }
  }

  const columns = useMemo<ColumnDef<DeliveryDto>[]>(
    () => [
      { accessorKey: 'deliveryNumber', header: t('sales.deliveries.deliveryNumber') },
      {
        id: 'status',
        header: t('common.status'),
        accessorFn: (row: DeliveryDto) => row.status,
        cell: ({ row }: { row: Row<DeliveryDto> }) => (
          <Badge variant={DELIVERY_STATUS_VARIANT[row.original.status]}>
            {t(deliveryStatusLabelKey(row.original.status))}
          </Badge>
        ),
      },
      {
        id: 'salesOrder',
        header: t('sales.deliveries.salesOrder'),
        accessorFn: (row: DeliveryDto) => soById.get(row.salesOrderId)?.soNumber ?? '—',
      },
      {
        id: 'deliveryDate',
        header: t('sales.deliveries.deliveryDate'),
        accessorFn: (row: DeliveryDto) => row.deliveryDate ?? '—',
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }: { row: Row<DeliveryDto> }) => {
          const delivery = row.original;
          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => setViewingId(delivery.id)}>
                  {t('sales.deliveries.viewDetails')}
                </DropdownMenuItem>
                <Can permission="sales.manage">
                  <>
                    {delivery.status === 'draft' ? (
                      <DropdownMenuItem onSelect={() => handleConfirm(delivery.id)}>
                        {t('sales.deliveries.confirm')}
                      </DropdownMenuItem>
                    ) : null}
                    {delivery.status === 'draft' ? (
                      <DropdownMenuItem onSelect={() => handleCancel(delivery.id)}>
                        {t('sales.deliveries.cancel')}
                      </DropdownMenuItem>
                    ) : null}
                    {delivery.status === 'draft' || delivery.status === 'cancelled' ? (
                      <DropdownMenuItem onSelect={() => handleDelete(delivery.id)}>
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
    [t, soById],
  );

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">{t('sales.deliveries.subtitle')}</p>
        <Can permission="sales.manage">
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            {t('sales.deliveries.newDelivery')}
          </Button>
        </Can>
      </div>

      <DataTable columns={columns} data={deliveries ?? []} isLoading={isLoading} />

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{t('sales.deliveries.newDelivery')}</DialogTitle>
          </DialogHeader>
          <CreateDeliveryForm onDone={() => setCreateOpen(false)} />
        </DialogContent>
      </Dialog>

      <Dialog open={viewingId !== null} onOpenChange={(open) => !open && setViewingId(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{t('sales.deliveries.viewDetails')}</DialogTitle>
          </DialogHeader>
          {viewingLoading ? <Skeleton className="h-40 w-full" /> : null}
          {viewingDelivery ? <DeliveryDetailsView delivery={viewingDelivery} /> : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

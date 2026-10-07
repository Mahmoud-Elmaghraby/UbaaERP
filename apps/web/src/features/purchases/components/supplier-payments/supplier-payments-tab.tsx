import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MoreHorizontal } from 'lucide-react';
import type { ColumnDef, Row } from '@tanstack/react-table';
import type { SupplierPaymentDto, SupplierPaymentStatusDto } from '@erp-platform/contracts';
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
  useCancelSupplierPayment,
  useDeleteSupplierPayment,
  usePostSupplierPayment,
  useSupplierPayment,
  useSupplierPayments,
} from '../../api/supplier-payments/queries';
import { CreateSupplierPaymentForm } from './supplier-payment-form';
import { AllocateSupplierPaymentForm } from './supplier-payment-allocate-form';
import { SupplierPaymentDetailsView } from './supplier-payment-details-view';
import { SUPPLIER_PAYMENT_STATUS_VARIANT, supplierPaymentStatusLabelKey } from './supplier-payment-status';
import { formatMoney } from '../../../../lib/money';
import { ApiError } from '../../../../lib/api-client';

type ActionKey = 'post' | 'allocate' | 'cancel' | 'delete';

/** Which actions a payment in this status offers — mirrors the backend's own status rules. */
function availableActions(status: SupplierPaymentStatusDto): ActionKey[] {
  if (status === 'draft') return ['post', 'cancel', 'delete'];
  if (status === 'posted') return ['allocate'];
  return ['delete'];
}

const ACTION_LABEL: Record<ActionKey, string> = {
  post: 'purchases.supplierPayments.post',
  allocate: 'purchases.supplierPayments.allocate',
  cancel: 'purchases.supplierPayments.cancel',
  delete: 'common.delete',
};

export function SupplierPaymentsTab() {
  const { t } = useTranslation();
  const { data: payments, isLoading } = useSupplierPayments();
  const { data: suppliers } = useSuppliers();
  const [createOpen, setCreateOpen] = useState(false);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [allocatingId, setAllocatingId] = useState<string | null>(null);
  const { data: viewingPayment, isLoading: viewingLoading } = useSupplierPayment(viewingId);
  const { data: allocatingPayment, isLoading: allocatingLoading } = useSupplierPayment(allocatingId);

  const postPayment = usePostSupplierPayment();
  const cancelPayment = useCancelSupplierPayment();
  const deletePayment = useDeleteSupplierPayment();
  const pending = postPayment.isPending || cancelPayment.isPending || deletePayment.isPending;

  const supplierById = useMemo(() => new Map((suppliers ?? []).map((s) => [s.id, s])), [suppliers]);

  async function run(action: ActionKey, id: string): Promise<void> {
    if (action === 'allocate') {
      setViewingId(null);
      setAllocatingId(id);
      return;
    }
    const config = {
      post: { mutation: postPayment, confirm: 'postConfirm', success: 'postSuccess', error: 'postError' },
      cancel: { mutation: cancelPayment, confirm: 'cancelConfirm', success: 'cancelSuccess', error: 'cancelError' },
      delete: { mutation: deletePayment, confirm: 'deleteConfirm', success: 'deleteSuccess', error: 'deleteError' },
    }[action];
    if (!window.confirm(t(`purchases.supplierPayments.${config.confirm}`))) return;
    try {
      await config.mutation.mutateAsync(id);
      toast.success(t(`purchases.supplierPayments.${config.success}`));
      if (action === 'delete') setViewingId(null);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t(`purchases.supplierPayments.${config.error}`));
    }
  }

  const columns = useMemo<ColumnDef<SupplierPaymentDto>[]>(
    () => [
      { accessorKey: 'paymentNumber', header: t('purchases.supplierPayments.paymentNumber') },
      {
        id: 'status',
        header: t('common.status'),
        accessorFn: (row: SupplierPaymentDto) => row.status,
        cell: ({ row }: { row: Row<SupplierPaymentDto> }) => (
          <Badge variant={SUPPLIER_PAYMENT_STATUS_VARIANT[row.original.status]} dot>
            {t(supplierPaymentStatusLabelKey(row.original.status))}
          </Badge>
        ),
      },
      {
        id: 'supplier',
        header: t('purchases.supplierPayments.supplier'),
        accessorFn: (row: SupplierPaymentDto) => supplierById.get(row.supplierId)?.name ?? '—',
      },
      {
        id: 'paymentMethod',
        header: t('purchases.supplierPayments.paymentMethod'),
        accessorFn: (row: SupplierPaymentDto) => t(`purchases.supplierPayments.paymentMethodValue.${row.paymentMethod}`),
      },
      {
        id: 'paymentDate',
        header: t('purchases.supplierPayments.paymentDate'),
        accessorFn: (row: SupplierPaymentDto) => row.paymentDate ?? '—',
      },
      {
        id: 'amount',
        header: t('purchases.supplierPayments.amount'),
        accessorFn: (row: SupplierPaymentDto) => formatMoney(row.amount.amountMinorUnits, row.amount.currency),
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }: { row: Row<SupplierPaymentDto> }) => {
          const payment = row.original;
          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label={t('common.actions')}>
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => setViewingId(payment.id)}>
                  {t('purchases.supplierPayments.viewDetails')}
                </DropdownMenuItem>
                <Can permission="purchases.manage">
                  <>
                    {availableActions(payment.status).map((action) => (
                      <DropdownMenuItem key={action} onSelect={() => void run(action, payment.id)}>
                        {t(ACTION_LABEL[action])}
                      </DropdownMenuItem>
                    ))}
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
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Can permission="purchases.manage">
          <Button onClick={() => setCreateOpen(true)}>{t('purchases.supplierPayments.newPayment')}</Button>
        </Can>
      </div>

      <DataTable columns={columns} data={payments ?? []} isLoading={isLoading} />

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{t('purchases.supplierPayments.newPayment')}</DialogTitle>
          </DialogHeader>
          <CreateSupplierPaymentForm onDone={() => setCreateOpen(false)} />
        </DialogContent>
      </Dialog>

      <Dialog open={viewingId !== null} onOpenChange={(open) => !open && setViewingId(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{t('purchases.supplierPayments.viewDetails')}</DialogTitle>
          </DialogHeader>
          {viewingLoading ? <Skeleton className="h-40 w-full" /> : null}
          {viewingPayment ? (
            <SupplierPaymentDetailsView
              payment={viewingPayment}
              actions={
                <Can permission="purchases.manage">
                  <>
                    {availableActions(viewingPayment.status).map((action) => (
                      <Button
                        key={action}
                        variant={action === 'post' || action === 'allocate' ? 'default' : 'outline'}
                        disabled={pending}
                        onClick={() => void run(action, viewingPayment.id)}
                      >
                        {t(ACTION_LABEL[action])}
                      </Button>
                    ))}
                  </>
                </Can>
              }
            />
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={allocatingId !== null} onOpenChange={(open) => !open && setAllocatingId(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{t('purchases.supplierPayments.allocate')}</DialogTitle>
          </DialogHeader>
          {allocatingLoading ? <Skeleton className="h-40 w-full" /> : null}
          {allocatingPayment ? (
            <AllocateSupplierPaymentForm payment={allocatingPayment} onDone={() => setAllocatingId(null)} />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

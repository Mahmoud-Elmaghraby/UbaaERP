import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MoreHorizontal } from 'lucide-react';
import type { ColumnDef, Row } from '@tanstack/react-table';
import type { PaymentReceivedDto } from '@erp-platform/contracts';
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
  useCancelPaymentReceived,
  useDeletePaymentReceived,
  usePaymentReceived,
  usePaymentsReceived,
  usePostPaymentReceived,
} from '../../api/payments-received/queries';
import { CreatePaymentReceivedForm } from './payment-received-form';
import { AllocatePaymentReceivedForm } from './payment-received-allocate-form';
import { PaymentReceivedDetailsView } from './payment-received-details-view';
import {
  PAYMENT_RECEIVED_STATUS_VARIANT,
  paymentReceivedStatusLabelKey,
} from './payment-received-status';
import { formatMoney } from '../../../../lib/money';
import { ApiError } from '../../../../lib/api-client';

export function PaymentsReceivedTab() {
  const { t } = useTranslation();
  const { data: payments, isLoading } = usePaymentsReceived();
  const { data: customers } = useCustomers();
  const [createOpen, setCreateOpen] = useState(false);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [allocatingId, setAllocatingId] = useState<string | null>(null);

  const { data: viewingPayment, isLoading: viewingLoading } = usePaymentReceived(viewingId);
  const { data: allocatingPayment, isLoading: allocatingLoading } =
    usePaymentReceived(allocatingId);

  const postPayment = usePostPaymentReceived();
  const cancelPayment = useCancelPaymentReceived();
  const deletePayment = useDeletePaymentReceived();

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

  async function handlePost(id: string) {
    if (!window.confirm(t('sales.paymentsReceived.postConfirm'))) return;
    await handleTransition(
      postPayment,
      id,
      'sales.paymentsReceived.postSuccess',
      'sales.paymentsReceived.postError',
    );
  }

  async function handleCancel(id: string) {
    if (!window.confirm(t('sales.paymentsReceived.cancelConfirm'))) return;
    await handleTransition(
      cancelPayment,
      id,
      'sales.paymentsReceived.cancelSuccess',
      'sales.paymentsReceived.cancelError',
    );
  }

  async function handleDelete(id: string) {
    if (!window.confirm(t('sales.paymentsReceived.deleteConfirm'))) return;
    try {
      await deletePayment.mutateAsync(id);
      toast.success(t('sales.paymentsReceived.deleteSuccess'));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('common.error'));
    }
  }

  const columns = useMemo<ColumnDef<PaymentReceivedDto>[]>(
    () => [
      { accessorKey: 'paymentNumber', header: t('sales.paymentsReceived.paymentNumber') },
      {
        id: 'status',
        header: t('common.status'),
        accessorFn: (row: PaymentReceivedDto) => row.status,
        cell: ({ row }: { row: Row<PaymentReceivedDto> }) => (
          <Badge variant={PAYMENT_RECEIVED_STATUS_VARIANT[row.original.status]} dot>
            {t(paymentReceivedStatusLabelKey(row.original.status))}
          </Badge>
        ),
      },
      {
        id: 'customer',
        header: t('sales.paymentsReceived.customer'),
        accessorFn: (row: PaymentReceivedDto) => customerById.get(row.customerId)?.name ?? '—',
      },
      {
        id: 'amount',
        header: t('sales.paymentsReceived.amount'),
        accessorFn: (row: PaymentReceivedDto) =>
          formatMoney(row.amount.amountMinorUnits, row.amount.currency),
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }: { row: Row<PaymentReceivedDto> }) => {
          const payment = row.original;
          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => setViewingId(payment.id)}>
                  {t('sales.paymentsReceived.viewDetails')}
                </DropdownMenuItem>
                <Can permission="sales.manage">
                  <>
                    {payment.status === 'draft' ? (
                      <DropdownMenuItem onSelect={() => handlePost(payment.id)}>
                        {t('sales.paymentsReceived.post')}
                      </DropdownMenuItem>
                    ) : null}
                    {payment.status === 'posted' ? (
                      <DropdownMenuItem onSelect={() => setAllocatingId(payment.id)}>
                        {t('sales.paymentsReceived.allocate')}
                      </DropdownMenuItem>
                    ) : null}
                    {payment.status === 'draft' ? (
                      <DropdownMenuItem onSelect={() => handleCancel(payment.id)}>
                        {t('sales.paymentsReceived.cancel')}
                      </DropdownMenuItem>
                    ) : null}
                    {payment.status === 'draft' || payment.status === 'cancelled' ? (
                      <DropdownMenuItem onSelect={() => handleDelete(payment.id)}>
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
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Can permission="sales.manage">
          <Button onClick={() => setCreateOpen(true)}>
            {t('sales.paymentsReceived.newPayment')}
          </Button>
        </Can>
      </div>

      <DataTable columns={columns} data={payments ?? []} isLoading={isLoading} />

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{t('sales.paymentsReceived.newPayment')}</DialogTitle>
          </DialogHeader>
          <CreatePaymentReceivedForm onDone={() => setCreateOpen(false)} />
        </DialogContent>
      </Dialog>

      <Dialog open={viewingId !== null} onOpenChange={(open) => !open && setViewingId(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{t('sales.paymentsReceived.viewDetails')}</DialogTitle>
          </DialogHeader>
          {viewingLoading ? <Skeleton className="h-40 w-full" /> : null}
          {viewingPayment ? <PaymentReceivedDetailsView payment={viewingPayment} /> : null}
        </DialogContent>
      </Dialog>

      <Dialog open={allocatingId !== null} onOpenChange={(open) => !open && setAllocatingId(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{t('sales.paymentsReceived.allocate')}</DialogTitle>
          </DialogHeader>
          {allocatingLoading ? <Skeleton className="h-40 w-full" /> : null}
          {allocatingPayment ? (
            <AllocatePaymentReceivedForm
              payment={allocatingPayment}
              onDone={() => setAllocatingId(null)}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

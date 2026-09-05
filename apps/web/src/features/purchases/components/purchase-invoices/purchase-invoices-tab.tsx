import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MoreHorizontal } from 'lucide-react';
import type { ColumnDef, Row } from '@tanstack/react-table';
import type { PurchaseInvoiceDto } from '@erp-platform/contracts';
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
  useCancelPurchaseInvoice,
  useDeletePurchaseInvoice,
  usePostPurchaseInvoice,
  usePurchaseInvoice,
  usePurchaseInvoices,
} from '../../api/purchase-invoices/queries';
import { CreatePurchaseInvoiceForm } from './purchase-invoice-form';
import { PurchaseInvoiceDetailsView } from './purchase-invoice-details-view';
import { PURCHASE_INVOICE_STATUS_VARIANT, purchaseInvoiceStatusLabelKey } from './purchase-invoice-status';
import { ApiError } from '../../../../lib/api-client';

export function PurchaseInvoicesTab() {
  const { t } = useTranslation();
  const { data: invoices, isLoading } = usePurchaseInvoices();
  const { data: purchaseOrders } = usePurchaseOrders();
  const [createOpen, setCreateOpen] = useState(false);
  const [viewingId, setViewingId] = useState<string | null>(null);

  const { data: viewingInvoice, isLoading: viewingLoading } = usePurchaseInvoice(viewingId);

  const postInvoice = usePostPurchaseInvoice();
  const cancelInvoice = useCancelPurchaseInvoice();
  const deleteInvoice = useDeletePurchaseInvoice();

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

  async function handlePost(id: string) {
    if (!window.confirm(t('purchases.purchaseInvoices.postConfirm'))) return;
    await handleTransition(
      postInvoice,
      id,
      'purchases.purchaseInvoices.postSuccess',
      'purchases.purchaseInvoices.postError',
    );
  }

  async function handleCancel(id: string) {
    if (!window.confirm(t('purchases.purchaseInvoices.cancelConfirm'))) return;
    await handleTransition(
      cancelInvoice,
      id,
      'purchases.purchaseInvoices.cancelSuccess',
      'purchases.purchaseInvoices.cancelError',
    );
  }

  async function handleDelete(id: string) {
    if (!window.confirm(t('purchases.purchaseInvoices.deleteConfirm'))) return;
    try {
      await deleteInvoice.mutateAsync(id);
      toast.success(t('purchases.purchaseInvoices.deleteSuccess'));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('common.error'));
    }
  }

  const columns = useMemo<ColumnDef<PurchaseInvoiceDto>[]>(
    () => [
      { accessorKey: 'invoiceNumber', header: t('purchases.purchaseInvoices.invoiceNumber') },
      {
        id: 'status',
        header: t('common.status'),
        accessorFn: (row: PurchaseInvoiceDto) => row.status,
        cell: ({ row }: { row: Row<PurchaseInvoiceDto> }) => (
          <Badge variant={PURCHASE_INVOICE_STATUS_VARIANT[row.original.status]}>
            {t(purchaseInvoiceStatusLabelKey(row.original.status))}
          </Badge>
        ),
      },
      {
        id: 'purchaseOrder',
        header: t('purchases.purchaseInvoices.purchaseOrder'),
        accessorFn: (row: PurchaseInvoiceDto) => poById.get(row.purchaseOrderId)?.poNumber ?? '—',
      },
      {
        id: 'dueDate',
        header: t('purchases.purchaseInvoices.dueDate'),
        accessorFn: (row: PurchaseInvoiceDto) => row.dueDate ?? '—',
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }: { row: Row<PurchaseInvoiceDto> }) => {
          const invoice = row.original;
          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => setViewingId(invoice.id)}>
                  {t('purchases.purchaseInvoices.viewDetails')}
                </DropdownMenuItem>
                <Can permission="purchases.manage">
                  <>
                    {invoice.status === 'draft' ? (
                      <DropdownMenuItem onSelect={() => handlePost(invoice.id)}>
                        {t('purchases.purchaseInvoices.post')}
                      </DropdownMenuItem>
                    ) : null}
                    {invoice.status === 'draft' ? (
                      <DropdownMenuItem onSelect={() => handleCancel(invoice.id)}>
                        {t('purchases.purchaseInvoices.cancel')}
                      </DropdownMenuItem>
                    ) : null}
                    {invoice.status === 'draft' || invoice.status === 'cancelled' ? (
                      <DropdownMenuItem onSelect={() => handleDelete(invoice.id)}>
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
        <p className="text-sm text-muted-foreground">{t('purchases.purchaseInvoices.subtitle')}</p>
        <Can permission="purchases.manage">
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            {t('purchases.purchaseInvoices.newInvoice')}
          </Button>
        </Can>
      </div>

      <DataTable columns={columns} data={invoices ?? []} isLoading={isLoading} />

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{t('purchases.purchaseInvoices.newInvoice')}</DialogTitle>
          </DialogHeader>
          <CreatePurchaseInvoiceForm onDone={() => setCreateOpen(false)} />
        </DialogContent>
      </Dialog>

      <Dialog open={viewingId !== null} onOpenChange={(open) => !open && setViewingId(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{t('purchases.purchaseInvoices.viewDetails')}</DialogTitle>
          </DialogHeader>
          {viewingLoading ? <Skeleton className="h-40 w-full" /> : null}
          {viewingInvoice ? <PurchaseInvoiceDetailsView invoice={viewingInvoice} /> : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MoreHorizontal } from 'lucide-react';
import type { ColumnDef, Row } from '@tanstack/react-table';
import type { SalesInvoiceDto } from '@erp-platform/contracts';
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
  useCancelSalesInvoice,
  useDeleteSalesInvoice,
  usePostSalesInvoice,
  useSalesInvoice,
  useSalesInvoices,
} from '../../api/sales-invoices/queries';
import { CreateSalesInvoiceForm } from './sales-invoice-form';
import { SalesInvoiceDetailsView } from './sales-invoice-details-view';
import { SALES_INVOICE_STATUS_VARIANT, salesInvoiceStatusLabelKey } from './sales-invoice-status';
import { ApiError } from '../../../../lib/api-client';

export function SalesInvoicesTab() {
  const { t } = useTranslation();
  const { data: invoices, isLoading } = useSalesInvoices();
  const { data: salesOrders } = useSalesOrders();
  const [createOpen, setCreateOpen] = useState(false);
  const [viewingId, setViewingId] = useState<string | null>(null);

  const { data: viewingInvoice, isLoading: viewingLoading } = useSalesInvoice(viewingId);

  const postInvoice = usePostSalesInvoice();
  const cancelInvoice = useCancelSalesInvoice();
  const deleteInvoice = useDeleteSalesInvoice();

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

  async function handlePost(id: string) {
    if (!window.confirm(t('sales.salesInvoices.postConfirm'))) return;
    await handleTransition(
      postInvoice,
      id,
      'sales.salesInvoices.postSuccess',
      'sales.salesInvoices.postError',
    );
  }

  async function handleCancel(id: string) {
    if (!window.confirm(t('sales.salesInvoices.cancelConfirm'))) return;
    await handleTransition(
      cancelInvoice,
      id,
      'sales.salesInvoices.cancelSuccess',
      'sales.salesInvoices.cancelError',
    );
  }

  async function handleDelete(id: string) {
    if (!window.confirm(t('sales.salesInvoices.deleteConfirm'))) return;
    try {
      await deleteInvoice.mutateAsync(id);
      toast.success(t('sales.salesInvoices.deleteSuccess'));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('common.error'));
    }
  }

  const columns = useMemo<ColumnDef<SalesInvoiceDto>[]>(
    () => [
      { accessorKey: 'invoiceNumber', header: t('sales.salesInvoices.invoiceNumber') },
      {
        id: 'status',
        header: t('common.status'),
        accessorFn: (row: SalesInvoiceDto) => row.status,
        cell: ({ row }: { row: Row<SalesInvoiceDto> }) => (
          <Badge variant={SALES_INVOICE_STATUS_VARIANT[row.original.status]}>
            {t(salesInvoiceStatusLabelKey(row.original.status))}
          </Badge>
        ),
      },
      {
        id: 'salesOrder',
        header: t('sales.salesInvoices.salesOrder'),
        accessorFn: (row: SalesInvoiceDto) => soById.get(row.salesOrderId)?.soNumber ?? '—',
      },
      {
        id: 'dueDate',
        header: t('sales.salesInvoices.dueDate'),
        accessorFn: (row: SalesInvoiceDto) => row.dueDate ?? '—',
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }: { row: Row<SalesInvoiceDto> }) => {
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
                  {t('sales.salesInvoices.viewDetails')}
                </DropdownMenuItem>
                <Can permission="sales.manage">
                  <>
                    {invoice.status === 'draft' ? (
                      <DropdownMenuItem onSelect={() => handlePost(invoice.id)}>
                        {t('sales.salesInvoices.post')}
                      </DropdownMenuItem>
                    ) : null}
                    {invoice.status === 'draft' ? (
                      <DropdownMenuItem onSelect={() => handleCancel(invoice.id)}>
                        {t('sales.salesInvoices.cancel')}
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
    [t, soById],
  );

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">{t('sales.salesInvoices.subtitle')}</p>
        <Can permission="sales.manage">
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            {t('sales.salesInvoices.newInvoice')}
          </Button>
        </Can>
      </div>

      <DataTable columns={columns} data={invoices ?? []} isLoading={isLoading} />

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{t('sales.salesInvoices.newInvoice')}</DialogTitle>
          </DialogHeader>
          <CreateSalesInvoiceForm onDone={() => setCreateOpen(false)} />
        </DialogContent>
      </Dialog>

      <Dialog open={viewingId !== null} onOpenChange={(open) => !open && setViewingId(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{t('sales.salesInvoices.viewDetails')}</DialogTitle>
          </DialogHeader>
          {viewingLoading ? <Skeleton className="h-40 w-full" /> : null}
          {viewingInvoice ? <SalesInvoiceDetailsView invoice={viewingInvoice} /> : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

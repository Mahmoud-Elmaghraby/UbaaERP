import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MoreHorizontal } from 'lucide-react';
import type { ColumnDef, Row } from '@tanstack/react-table';
import type { QuotationDto } from '@erp-platform/contracts';
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
  useAcceptQuotation,
  useCancelQuotation,
  useDeleteQuotation,
  useQuotation,
  useQuotations,
  useRejectQuotation,
  useSendQuotation,
} from '../../api/quotations/queries';
import { CreateQuotationForm, EditQuotationForm } from './quotation-form';
import { QuotationDetailsView } from './quotation-details-view';
import { QUOTATION_STATUS_VARIANT, quotationStatusLabelKey } from './quotation-status';
import { ApiError } from '../../../../lib/api-client';

export function QuotationsTab() {
  const { t } = useTranslation();
  const { data: quotations, isLoading } = useQuotations();
  const { data: customers } = useCustomers();
  const [createOpen, setCreateOpen] = useState(false);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const { data: viewingQuotation, isLoading: viewingLoading } = useQuotation(viewingId);
  const { data: editingQuotation, isLoading: editingLoading } = useQuotation(editingId);

  const sendQuotation = useSendQuotation();
  const acceptQuotation = useAcceptQuotation();
  const rejectQuotation = useRejectQuotation();
  const cancelQuotation = useCancelQuotation();
  const deleteQuotation = useDeleteQuotation();

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

  async function handleSend(id: string) {
    await handleTransition(
      sendQuotation,
      id,
      'sales.quotations.sendSuccess',
      'sales.quotations.sendError',
    );
  }

  async function handleAccept(id: string) {
    await handleTransition(
      acceptQuotation,
      id,
      'sales.quotations.acceptSuccess',
      'sales.quotations.acceptError',
    );
  }

  async function handleReject(id: string) {
    if (!window.confirm(t('sales.quotations.rejectConfirm'))) return;
    await handleTransition(
      rejectQuotation,
      id,
      'sales.quotations.rejectSuccess',
      'sales.quotations.rejectError',
    );
  }

  async function handleCancel(id: string) {
    if (!window.confirm(t('sales.quotations.cancelConfirm'))) return;
    await handleTransition(
      cancelQuotation,
      id,
      'sales.quotations.cancelSuccess',
      'sales.quotations.cancelError',
    );
  }

  async function handleDelete(id: string) {
    if (!window.confirm(t('sales.quotations.deleteConfirm'))) return;
    try {
      await deleteQuotation.mutateAsync(id);
      toast.success(t('sales.quotations.deleteSuccess'));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('common.error'));
    }
  }

  const columns = useMemo<ColumnDef<QuotationDto>[]>(
    () => [
      { accessorKey: 'quotationNumber', header: t('sales.quotations.quotationNumber') },
      {
        id: 'status',
        header: t('common.status'),
        accessorFn: (row: QuotationDto) => row.status,
        cell: ({ row }: { row: Row<QuotationDto> }) => (
          <Badge variant={QUOTATION_STATUS_VARIANT[row.original.status]} dot>
            {t(quotationStatusLabelKey(row.original.status))}
          </Badge>
        ),
      },
      {
        id: 'customer',
        header: t('sales.quotations.customer'),
        accessorFn: (row: QuotationDto) => customerById.get(row.customerId)?.name ?? '—',
      },
      {
        id: 'validUntilDate',
        header: t('sales.quotations.validUntilDate'),
        accessorFn: (row: QuotationDto) => row.validUntilDate ?? '—',
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }: { row: Row<QuotationDto> }) => {
          const quotation = row.original;
          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => setViewingId(quotation.id)}>
                  {t('sales.quotations.viewDetails')}
                </DropdownMenuItem>
                <Can permission="sales.manage">
                  <>
                    {quotation.status === 'draft' ? (
                      <DropdownMenuItem onSelect={() => setEditingId(quotation.id)}>
                        {t('common.edit')}
                      </DropdownMenuItem>
                    ) : null}
                    {quotation.status === 'draft' ? (
                      <DropdownMenuItem onSelect={() => handleSend(quotation.id)}>
                        {t('sales.quotations.send')}
                      </DropdownMenuItem>
                    ) : null}
                    {quotation.status === 'sent' ? (
                      <DropdownMenuItem onSelect={() => handleAccept(quotation.id)}>
                        {t('sales.quotations.accept')}
                      </DropdownMenuItem>
                    ) : null}
                    {quotation.status === 'sent' ? (
                      <DropdownMenuItem onSelect={() => handleReject(quotation.id)}>
                        {t('sales.quotations.reject')}
                      </DropdownMenuItem>
                    ) : null}
                    {quotation.status === 'draft' || quotation.status === 'sent' ? (
                      <DropdownMenuItem onSelect={() => handleCancel(quotation.id)}>
                        {t('sales.quotations.cancel')}
                      </DropdownMenuItem>
                    ) : null}
                    {quotation.status === 'draft' || quotation.status === 'cancelled' ? (
                      <DropdownMenuItem onSelect={() => handleDelete(quotation.id)}>
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
            {t('sales.quotations.newQuotation')}
          </Button>
        </Can>
      </div>

      <DataTable columns={columns} data={quotations ?? []} isLoading={isLoading} />

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{t('sales.quotations.newQuotation')}</DialogTitle>
          </DialogHeader>
          <CreateQuotationForm onDone={() => setCreateOpen(false)} />
        </DialogContent>
      </Dialog>

      <Dialog open={viewingId !== null} onOpenChange={(open) => !open && setViewingId(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{t('sales.quotations.viewDetails')}</DialogTitle>
          </DialogHeader>
          {viewingLoading ? <Skeleton className="h-40 w-full" /> : null}
          {viewingQuotation ? <QuotationDetailsView quotation={viewingQuotation} /> : null}
        </DialogContent>
      </Dialog>

      <Dialog open={editingId !== null} onOpenChange={(open) => !open && setEditingId(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{t('common.edit')}</DialogTitle>
          </DialogHeader>
          {editingLoading ? <Skeleton className="h-40 w-full" /> : null}
          {editingQuotation ? (
            <EditQuotationForm quotation={editingQuotation} onDone={() => setEditingId(null)} />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

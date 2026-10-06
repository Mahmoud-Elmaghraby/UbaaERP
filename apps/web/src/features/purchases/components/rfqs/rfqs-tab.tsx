import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MoreHorizontal } from 'lucide-react';
import type { ColumnDef, Row } from '@tanstack/react-table';
import type { RfqDto } from '@erp-platform/contracts';
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

import { usePurchaseRequisitions } from '../../api/purchase-requisitions/queries';
import { useCancelRfq, useDeleteRfq, useRfq, useRfqs, useSendRfq } from '../../api/rfqs/queries';
import { CreateRfqForm, EditRfqForm } from './rfq-form';
import { RfqDetailsView } from './rfq-details-view';
import { RFQ_STATUS_VARIANT, rfqStatusLabelKey } from './rfq-status';
import { ApiError } from '../../../../lib/api-client';

export function RfqsTab() {
  const { t } = useTranslation();
  const { data: rfqs, isLoading } = useRfqs();
  const { data: requisitions } = usePurchaseRequisitions();
  const [createOpen, setCreateOpen] = useState(false);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const { data: viewingRfq, isLoading: viewingLoading } = useRfq(viewingId);
  const { data: editingRfq, isLoading: editingLoading } = useRfq(editingId);

  const sendRfq = useSendRfq();
  const cancelRfq = useCancelRfq();
  const deleteRfq = useDeleteRfq();

  const requisitionById = useMemo(
    () => new Map((requisitions ?? []).map((r) => [r.id, r])),
    [requisitions],
  );

  async function handleSend(id: string) {
    try {
      await sendRfq.mutateAsync(id);
      toast.success(t('purchases.rfqs.sendSuccess'));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('purchases.rfqs.sendError'));
    }
  }

  async function handleCancel(id: string) {
    if (!window.confirm(t('purchases.rfqs.cancelConfirm'))) return;
    try {
      await cancelRfq.mutateAsync(id);
      toast.success(t('purchases.rfqs.cancelSuccess'));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('purchases.rfqs.cancelError'));
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm(t('purchases.rfqs.deleteConfirm'))) return;
    try {
      await deleteRfq.mutateAsync(id);
      toast.success(t('purchases.rfqs.deleteSuccess'));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('common.error'));
    }
  }

  const columns = useMemo<ColumnDef<RfqDto>[]>(
    () => [
      { accessorKey: 'rfqNumber', header: t('purchases.rfqs.rfqNumber') },
      {
        id: 'status',
        header: t('common.status'),
        accessorFn: (row: RfqDto) => row.status,
        cell: ({ row }: { row: Row<RfqDto> }) => (
          <Badge variant={RFQ_STATUS_VARIANT[row.original.status]} dot>
            {t(rfqStatusLabelKey(row.original.status))}
          </Badge>
        ),
      },
      {
        id: 'sourceRequisition',
        header: t('purchases.rfqs.sourceRequisition'),
        accessorFn: (row: RfqDto) =>
          row.sourceRequisitionId
            ? (requisitionById.get(row.sourceRequisitionId)?.requisitionNumber ?? '—')
            : t('purchases.rfqs.noSourceRequisition'),
      },
      {
        id: 'notes',
        header: t('purchases.rfqs.notes'),
        accessorFn: (row: RfqDto) => row.notes ?? '—',
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }: { row: Row<RfqDto> }) => {
          const rfq = row.original;
          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => setViewingId(rfq.id)}>
                  {t('purchases.rfqs.viewDetails')}
                </DropdownMenuItem>
                <Can permission="purchases.manage">
                  <>
                    {rfq.status === 'draft' ? (
                      <DropdownMenuItem onSelect={() => setEditingId(rfq.id)}>
                        {t('common.edit')}
                      </DropdownMenuItem>
                    ) : null}
                    {rfq.status === 'draft' ? (
                      <DropdownMenuItem onSelect={() => handleSend(rfq.id)}>
                        {t('purchases.rfqs.send')}
                      </DropdownMenuItem>
                    ) : null}
                    {rfq.status === 'draft' || rfq.status === 'sent' ? (
                      <DropdownMenuItem onSelect={() => handleCancel(rfq.id)}>
                        {t('purchases.rfqs.cancel')}
                      </DropdownMenuItem>
                    ) : null}
                    {rfq.status === 'draft' || rfq.status === 'cancelled' ? (
                      <DropdownMenuItem onSelect={() => handleDelete(rfq.id)}>
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
    [t, requisitionById],
  );

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Can permission="purchases.manage">
          <Button onClick={() => setCreateOpen(true)}>
            {t('purchases.rfqs.newRfq')}
          </Button>
        </Can>
      </div>

      <DataTable columns={columns} data={rfqs ?? []} isLoading={isLoading} />

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{t('purchases.rfqs.newRfq')}</DialogTitle>
          </DialogHeader>
          <CreateRfqForm onDone={() => setCreateOpen(false)} />
        </DialogContent>
      </Dialog>

      <Dialog open={viewingId !== null} onOpenChange={(open) => !open && setViewingId(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>{t('purchases.rfqs.viewDetails')}</DialogTitle>
          </DialogHeader>
          {viewingLoading ? <Skeleton className="h-40 w-full" /> : null}
          {viewingRfq ? <RfqDetailsView rfq={viewingRfq} /> : null}
        </DialogContent>
      </Dialog>

      <Dialog open={editingId !== null} onOpenChange={(open) => !open && setEditingId(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{t('common.edit')}</DialogTitle>
          </DialogHeader>
          {editingLoading ? <Skeleton className="h-40 w-full" /> : null}
          {editingRfq ? <EditRfqForm rfq={editingRfq} onDone={() => setEditingId(null)} /> : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

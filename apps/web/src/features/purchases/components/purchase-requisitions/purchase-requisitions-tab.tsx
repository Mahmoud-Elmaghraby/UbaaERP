import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MoreHorizontal } from 'lucide-react';
import type { ColumnDef, Row } from '@tanstack/react-table';
import type { PurchaseRequisitionDto } from '@erp-platform/contracts';
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

import { useBranches } from '../../../settings/queries';
import { useUsers } from '../../../users-permissions/queries';
import {
  useApprovePurchaseRequisition,
  useCancelPurchaseRequisition,
  useDeletePurchaseRequisition,
  usePurchaseRequisition,
  usePurchaseRequisitions,
  useRejectPurchaseRequisition,
  useSubmitPurchaseRequisition,
} from '../../api/purchase-requisitions/queries';
import {
  CreatePurchaseRequisitionForm,
  EditPurchaseRequisitionForm,
} from './purchase-requisition-form';
import { PurchaseRequisitionDetailsView } from './purchase-requisition-details-view';
import {
  PURCHASE_REQUISITION_STATUS_VARIANT,
  purchaseRequisitionStatusLabelKey,
} from './purchase-requisition-status';
import { ApiError } from '../../../../lib/api-client';

export function PurchaseRequisitionsTab() {
  const { t } = useTranslation();
  const { data: requisitions, isLoading } = usePurchaseRequisitions();
  const { data: branches } = useBranches();
  const { data: users } = useUsers();
  const [createOpen, setCreateOpen] = useState(false);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const { data: viewingRequisition, isLoading: viewingLoading } = usePurchaseRequisition(viewingId);
  const { data: editingRequisition, isLoading: editingLoading } = usePurchaseRequisition(editingId);

  const submitRequisition = useSubmitPurchaseRequisition();
  const approveRequisition = useApprovePurchaseRequisition();
  const rejectRequisition = useRejectPurchaseRequisition();
  const cancelRequisition = useCancelPurchaseRequisition();
  const deleteRequisition = useDeletePurchaseRequisition();

  const branchById = useMemo(() => new Map((branches ?? []).map((b) => [b.id, b])), [branches]);
  const userById = useMemo(() => new Map((users ?? []).map((u) => [u.id, u])), [users]);

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

  async function handleCancel(id: string) {
    if (!window.confirm(t('purchases.purchaseRequisitions.cancelConfirm'))) return;
    await handleTransition(
      cancelRequisition,
      id,
      'purchases.purchaseRequisitions.cancelSuccess',
      'purchases.purchaseRequisitions.cancelError',
    );
  }

  async function handleReject(id: string) {
    if (!window.confirm(t('purchases.purchaseRequisitions.rejectConfirm'))) return;
    await handleTransition(
      rejectRequisition,
      id,
      'purchases.purchaseRequisitions.rejectSuccess',
      'purchases.purchaseRequisitions.rejectError',
    );
  }

  async function handleDelete(id: string) {
    if (!window.confirm(t('purchases.purchaseRequisitions.deleteConfirm'))) return;
    try {
      await deleteRequisition.mutateAsync(id);
      toast.success(t('purchases.purchaseRequisitions.deleteSuccess'));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('common.error'));
    }
  }

  const columns = useMemo<ColumnDef<PurchaseRequisitionDto>[]>(
    () => [
      {
        accessorKey: 'requisitionNumber',
        header: t('purchases.purchaseRequisitions.requisitionNumber'),
      },
      {
        id: 'status',
        header: t('common.status'),
        accessorFn: (row: PurchaseRequisitionDto) => row.status,
        cell: ({ row }: { row: Row<PurchaseRequisitionDto> }) => (
          <Badge variant={PURCHASE_REQUISITION_STATUS_VARIANT[row.original.status]} dot>
            {t(purchaseRequisitionStatusLabelKey(row.original.status))}
          </Badge>
        ),
      },
      {
        id: 'branch',
        header: t('purchases.purchaseRequisitions.branch'),
        accessorFn: (row: PurchaseRequisitionDto) =>
          row.branchId
            ? (branchById.get(row.branchId)?.name ?? '—')
            : t('purchases.purchaseRequisitions.noBranch'),
      },
      {
        id: 'requestedBy',
        header: t('purchases.purchaseRequisitions.requestedBy'),
        accessorFn: (row: PurchaseRequisitionDto) => userById.get(row.requestedBy)?.fullName ?? '—',
      },
      {
        id: 'neededByDate',
        header: t('purchases.purchaseRequisitions.neededByDate'),
        accessorFn: (row: PurchaseRequisitionDto) => row.neededByDate ?? '—',
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }: { row: Row<PurchaseRequisitionDto> }) => {
          const requisition = row.original;
          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => setViewingId(requisition.id)}>
                  {t('purchases.purchaseRequisitions.viewDetails')}
                </DropdownMenuItem>
                <Can permission="purchases.manage">
                  <>
                    {requisition.status === 'draft' ? (
                      <DropdownMenuItem onSelect={() => setEditingId(requisition.id)}>
                        {t('common.edit')}
                      </DropdownMenuItem>
                    ) : null}
                    {requisition.status === 'draft' ? (
                      <DropdownMenuItem
                        onSelect={() =>
                          handleTransition(
                            submitRequisition,
                            requisition.id,
                            'purchases.purchaseRequisitions.submitSuccess',
                            'purchases.purchaseRequisitions.submitError',
                          )
                        }
                      >
                        {t('purchases.purchaseRequisitions.submit')}
                      </DropdownMenuItem>
                    ) : null}
                    {requisition.status === 'submitted' ? (
                      <DropdownMenuItem
                        onSelect={() =>
                          handleTransition(
                            approveRequisition,
                            requisition.id,
                            'purchases.purchaseRequisitions.approveSuccess',
                            'purchases.purchaseRequisitions.approveError',
                          )
                        }
                      >
                        {t('purchases.purchaseRequisitions.approve')}
                      </DropdownMenuItem>
                    ) : null}
                    {requisition.status === 'submitted' ? (
                      <DropdownMenuItem onSelect={() => handleReject(requisition.id)}>
                        {t('purchases.purchaseRequisitions.reject')}
                      </DropdownMenuItem>
                    ) : null}
                    {requisition.status === 'draft' || requisition.status === 'submitted' ? (
                      <DropdownMenuItem onSelect={() => handleCancel(requisition.id)}>
                        {t('purchases.purchaseRequisitions.cancel')}
                      </DropdownMenuItem>
                    ) : null}
                    {requisition.status === 'draft' || requisition.status === 'cancelled' ? (
                      <DropdownMenuItem onSelect={() => handleDelete(requisition.id)}>
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
    [t, branchById, userById],
  );

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Can permission="purchases.manage">
          <Button onClick={() => setCreateOpen(true)}>
            {t('purchases.purchaseRequisitions.newRequisition')}
          </Button>
        </Can>
      </div>

      <DataTable columns={columns} data={requisitions ?? []} isLoading={isLoading} />

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{t('purchases.purchaseRequisitions.newRequisition')}</DialogTitle>
          </DialogHeader>
          <CreatePurchaseRequisitionForm onDone={() => setCreateOpen(false)} />
        </DialogContent>
      </Dialog>

      <Dialog open={viewingId !== null} onOpenChange={(open) => !open && setViewingId(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{t('purchases.purchaseRequisitions.viewDetails')}</DialogTitle>
          </DialogHeader>
          {viewingLoading ? <Skeleton className="h-40 w-full" /> : null}
          {viewingRequisition ? (
            <PurchaseRequisitionDetailsView requisition={viewingRequisition} />
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={editingId !== null} onOpenChange={(open) => !open && setEditingId(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{t('common.edit')}</DialogTitle>
          </DialogHeader>
          {editingLoading ? <Skeleton className="h-40 w-full" /> : null}
          {editingRequisition ? (
            <EditPurchaseRequisitionForm
              requisition={editingRequisition}
              onDone={() => setEditingId(null)}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

import { useMemo } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Badge,
  Button,
  Can,
  EmptyState,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  toast,
  useHasFeature,
} from '@erp-platform/ui';
import { Ban, CheckCircle2, FileQuestion, Pencil, Send, Trash2, X, FileSearch } from 'lucide-react';

import { useBranches } from '../../../settings/queries';
import { useUsers } from '../../../users-permissions/queries';
import { useRfqs } from '../../api/rfqs/queries';
import {
  useApprovePurchaseRequisition,
  useCancelPurchaseRequisition,
  useDeletePurchaseRequisition,
  usePurchaseRequisition,
  useRejectPurchaseRequisition,
  useSubmitPurchaseRequisition,
} from '../../api/purchase-requisitions/queries';
import { ApiError } from '../../../../lib/api-client';
import { FEATURE_KEYS } from '../../../../lib/feature-keys';
import { formatDate } from '../../../../lib/format-date';
import { confirmDialog } from '../../../../components/feedback/confirm-dialog';
import {
  DocumentBody,
  DocumentChain,
  DocumentHeaderBar,
  InfoGrid,
  SectionCard,
  type ChainStep,
} from '../../../../components/document/document-layout';
import { DocumentHistory } from '../../../../components/document/document-history';
import { QuantityWithUnit } from '../../../../components/product/unit-select';
import { useVariantIndex } from '../../../../components/product/use-variant-index';
import {
  PURCHASE_REQUISITION_STATUS_VARIANT,
  PURCHASE_REQUISITIONS_PATH,
  purchaseRequisitionStatusLabelKey,
} from './purchase-requisition-status';
import { PURCH, PURCH_WRITE } from '../../../../lib/permissions';

const RFQS_PATH = '/purchases/rfqs';

/** /purchases/purchase-requisitions/:id — submit → approve/reject, and the RFQs made from it. */
export function PurchaseRequisitionPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { data: requisition, isLoading, isError } = usePurchaseRequisition(id);
  const { data: branches } = useBranches();
  const { data: users } = useUsers();
  const rfqEnabled = useHasFeature(FEATURE_KEYS.PURCHASES_RFQ);
  const { data: rfqs } = useRfqs();
  const variantIndex = useVariantIndex();

  const submit = useSubmitPurchaseRequisition();
  const approve = useApprovePurchaseRequisition();
  const reject = useRejectPurchaseRequisition();
  const cancel = useCancelPurchaseRequisition();
  const remove = useDeletePurchaseRequisition();
  const busy = submit.isPending || approve.isPending || reject.isPending || cancel.isPending || remove.isPending;

  const linkedRfqs = useMemo(
    () => (rfqEnabled ? (rfqs ?? []).filter((r) => r.sourceRequisitionId === id && r.status !== 'cancelled') : []),
    [rfqs, rfqEnabled, id],
  );

  if (isLoading) return <Skeleton className="h-64 w-full rounded-xl" />;
  if (isError || !requisition) {
    return (
      <EmptyState
        icon={<FileQuestion />}
        title={t('documents.notFound')}
        action={
          <Button variant="outline" asChild>
            <Link to={PURCHASE_REQUISITIONS_PATH}>{t('documents.back')}</Link>
          </Button>
        }
      />
    );
  }

  const { status } = requisition;
  const branchName = branches?.find((b) => b.id === requisition.branchId)?.name;
  const requester = users?.find((u) => u.id === requisition.requestedBy)?.fullName;

  async function run(
    mutation: { mutateAsync: (id: string) => Promise<unknown> },
    key: 'submit' | 'approve' | 'reject' | 'cancel',
    confirmKey?: string,
  ) {
    if (confirmKey && !(await confirmDialog(t(confirmKey), { tone: 'danger' }))) return;
    try {
      await mutation.mutateAsync(requisition!.id);
      toast.success(t(`purchases.purchaseRequisitions.${key}Success`));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t(`purchases.purchaseRequisitions.${key}Error`));
    }
  }

  async function handleDelete() {
    if (!(await confirmDialog(t('purchases.purchaseRequisitions.deleteConfirm'), { tone: 'danger' }))) return;
    try {
      await remove.mutateAsync(requisition!.id);
      toast.success(t('purchases.purchaseRequisitions.deleteSuccess'));
      navigate(PURCHASE_REQUISITIONS_PATH, { replace: true });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('common.error'));
    }
  }

  const steps: ChainStep[] = [
    { key: 'draft', label: t('purchases.purchaseRequisitions.status.draft'), state: status === 'draft' ? 'current' : 'done' },
    {
      key: 'submitted',
      label: t('purchases.purchaseRequisitions.status.submitted'),
      state: status === 'submitted' ? 'current' : status === 'draft' ? 'upcoming' : 'done',
    },
    {
      key: 'decision',
      label: t(`purchases.purchaseRequisitions.status.${status === 'rejected' ? 'rejected' : 'approved'}`),
      state: status === 'approved' || status === 'rejected' ? 'done' : 'upcoming',
    },
    ...linkedRfqs.map<ChainStep>((rfq) => ({
      key: `rfq-${rfq.id}`,
      label: t('documents.steps.rfq'),
      detail: rfq.rfqNumber,
      state: rfq.status === 'closed' ? 'done' : 'current',
      to: `${RFQS_PATH}/${rfq.id}`,
    })),
  ];

  return (
    <div className="flex flex-col">
      <DocumentHeaderBar
        backTo={PURCHASE_REQUISITIONS_PATH}
        backLabel={t('documents.back')}
        eyebrow={t('purchases.tabs.purchaseRequisitions')}
        title={<span className="tabular">{requisition.requisitionNumber}</span>}
        status={
          <Badge variant={PURCHASE_REQUISITION_STATUS_VARIANT[status]} dot>
            {t(purchaseRequisitionStatusLabelKey(status))}
          </Badge>
        }
        actions={
          <Can permission={PURCH_WRITE}>
            <>
              {status === 'draft' || status === 'cancelled' ? (
                <Can permission={PURCH.cancel}>
                  <Button
                    variant="ghost"
                    className="text-danger hover:bg-danger-soft hover:text-danger"
                    disabled={busy}
                    onClick={() => void handleDelete()}
                  >
                    <Trash2 />
                    {t('common.delete')}
                  </Button>
                </Can>
              ) : null}
              {status === 'draft' || status === 'submitted' ? (
                <Can permission={PURCH.cancel}>
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={() => void run(cancel, 'cancel', 'purchases.purchaseRequisitions.cancelConfirm')}
                  >
                    <Ban />
                    {t('purchases.purchaseRequisitions.cancel')}
                  </Button>
                </Can>
              ) : null}
              {status === 'draft' ? (
                <>
                  <Can permission={PURCH.create}>
                    <Button variant="outline" asChild>
                      <Link to={`${PURCHASE_REQUISITIONS_PATH}/${requisition.id}/edit`}>
                        <Pencil />
                        {t('common.edit')}
                      </Link>
                    </Button>
                  </Can>
                  <Can permission={PURCH.create}>
                    <Button disabled={busy} onClick={() => void run(submit, 'submit')}>
                      <Send />
                      {t('purchases.purchaseRequisitions.submit')}
                    </Button>
                  </Can>
                </>
              ) : null}
              {status === 'submitted' ? (
                <>
                  <Can permission={PURCH.post}>
                    <Button
                      variant="outline"
                      disabled={busy}
                      onClick={() => void run(reject, 'reject', 'purchases.purchaseRequisitions.rejectConfirm')}
                    >
                      <X />
                      {t('purchases.purchaseRequisitions.reject')}
                    </Button>
                  </Can>
                  <Can permission={PURCH.post}>
                    <Button disabled={busy} onClick={() => void run(approve, 'approve')}>
                      <CheckCircle2 />
                      {t('purchases.purchaseRequisitions.approve')}
                    </Button>
                  </Can>
                </>
              ) : null}
              {status === 'approved' && rfqEnabled ? (
                <Can permission={PURCH.create}>
                  <Button asChild>
                    <Link to={`${RFQS_PATH}/new?requisitionId=${requisition.id}`}>
                      <FileSearch />
                      {t('purchases.purchaseRequisitions.createRfq')}
                    </Link>
                  </Button>
                </Can>
              ) : null}
            </>
          </Can>
        }
      />

      <DocumentChain steps={steps} label={t('documents.chain')} />

      <DocumentBody
        main={
          <>
            <SectionCard title={t('documents.info')}>
              <InfoGrid
                items={[
                  { label: t('purchases.purchaseRequisitions.requestedBy'), value: requester },
                  { label: t('documents.date'), value: <span className="tabular">{formatDate(requisition.createdAt)}</span> },
                  { label: t('purchases.purchaseRequisitions.branch'), value: branchName ?? t('purchases.purchaseRequisitions.noBranch') },
                  {
                    label: t('purchases.purchaseRequisitions.neededByDate'),
                    value: requisition.neededByDate ? <span className="tabular">{formatDate(requisition.neededByDate)}</span> : '—',
                  },
                  ...(requisition.notes ? [{ label: t('documents.notes'), value: requisition.notes, wide: true }] : []),
                ]}
              />
            </SectionCard>
            <SectionCard title={t('documents.lines')} description={`${t('documents.linesCount')}: ${requisition.lines.length}`} flush>
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-10 text-center">#</TableHead>
                    <TableHead>{t('purchases.purchaseRequisitions.lineProduct')}</TableHead>
                    <TableHead className="text-end">{t('documents.quantity')}</TableHead>
                    <TableHead>{t('purchases.purchaseRequisitions.lineNotes')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {requisition.lines.map((line, index) => {
                    const variant = variantIndex.get(line.productVariantId);
                    return (
                      <TableRow key={line.id}>
                        <TableCell className="text-center text-muted-foreground">{index + 1}</TableCell>
                        <TableCell>
                          <span className="font-medium">{variant?.productName ?? '—'}</span>
                          <span className="ms-2 text-xs text-muted-foreground">{variant?.sku}</span>
                        </TableCell>
                        <TableCell className="text-end">
                          <QuantityWithUnit quantity={line.quantity} productVariantId={line.productVariantId} unitOfMeasureId={null} />
                        </TableCell>
                        <TableCell className="text-muted-foreground">{line.notes ?? '—'}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </SectionCard>
          </>
        }
        side={<DocumentHistory entityType="purchase_requisition" entityId={requisition.id} />}
      />
    </div>
  );
}

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
} from '@erp-platform/ui';
import { Ban, CheckCircle2, FileQuestion, Trash2 } from 'lucide-react';

import { useGoodsReceipt } from '../../api/goods-receipts/queries';
import { usePurchaseOrder } from '../../api/purchase-orders/queries';
import { useSupplier } from '../../api/suppliers/queries';
import { usePurchaseDebitNotes } from '../../api/purchase-debit-notes/queries';
import {
  useCancelPurchaseReturn,
  useConfirmPurchaseReturn,
  useDeletePurchaseReturn,
  usePurchaseReturn,
} from '../../api/purchase-returns/queries';
import { ApiError } from '../../../../lib/api-client';
import { formatDate } from '../../../../lib/format-date';
import { Amount } from '../../../../components/amount';
import { confirmDialog } from '../../../../components/feedback/confirm-dialog';
import {
  DocumentBody,
  DocumentChain,
  DocumentHeaderBar,
  InfoGrid,
  SectionCard,
  TotalsPanel,
  type ChainStep,
} from '../../../../components/document/document-layout';
import { DocumentHistory } from '../../../../components/document/document-history';
import { QuantityWithUnit } from '../../../../components/product/unit-select';
import { useVariantIndex } from '../../../../components/product/use-variant-index';
import { PrintButton } from '../../../../components/printing/print-button';
import { PURCHASE_RETURN_STATUS_VARIANT, PURCHASE_RETURNS_PATH, purchaseReturnStatusLabelKey } from './purchase-return-status';
import { PURCH, PURCH_WRITE } from '../../../../lib/permissions';

const GOODS_RECEIPTS_PATH = '/purchases/goods-receipts';
const PURCHASE_ORDERS_PATH = '/purchases/purchase-orders';
const DEBIT_NOTES_PATH = '/purchases/debit-notes';

/** /purchases/purchase-returns/:id — the return, confirm/cancel/delete, and its debit note. */
export function PurchaseReturnPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { data: purchaseReturn, isLoading, isError } = usePurchaseReturn(id);
  const { data: receipt } = useGoodsReceipt(purchaseReturn?.goodsReceiptId);
  const { data: order } = usePurchaseOrder(receipt?.purchaseOrderId);
  const { data: supplier } = useSupplier(order?.supplierId);
  const { data: debitNotes } = usePurchaseDebitNotes(
    { purchaseReturnId: purchaseReturn?.id },
    purchaseReturn?.status === 'confirmed',
  );
  const variantIndex = useVariantIndex();

  const confirmReturn = useConfirmPurchaseReturn();
  const cancelReturn = useCancelPurchaseReturn();
  const deleteReturn = useDeletePurchaseReturn();
  const busy = confirmReturn.isPending || cancelReturn.isPending || deleteReturn.isPending;

  if (isLoading) {
    return (
      <div className="flex flex-col gap-5">
        <Skeleton className="h-14 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (isError || !purchaseReturn) {
    return (
      <EmptyState
        icon={<FileQuestion />}
        title={t('documents.notFound')}
        action={
          <Button variant="outline" asChild>
            <Link to={PURCHASE_RETURNS_PATH}>{t('documents.back')}</Link>
          </Button>
        }
      />
    );
  }

  const { status } = purchaseReturn;
  const isDraft = status === 'draft';
  const debitNote = debitNotes?.[0];
  const quantityTotal = purchaseReturn.lines.reduce((sum, line) => sum + line.quantityReturned, 0);

  async function run(
    mutation: { mutateAsync: (id: string) => Promise<unknown> },
    successKey: string,
    errorKey: string,
    confirmKey: string,
    tone?: 'danger',
  ) {
    if (!(await confirmDialog(t(confirmKey), tone ? { tone } : {}))) return;
    try {
      await mutation.mutateAsync(purchaseReturn!.id);
      toast.success(t(successKey));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t(errorKey));
    }
  }

  async function handleDelete() {
    if (!(await confirmDialog(t('purchases.purchaseReturns.deleteConfirm'), { tone: 'danger' }))) return;
    try {
      await deleteReturn.mutateAsync(purchaseReturn!.id);
      toast.success(t('purchases.purchaseReturns.deleteSuccess'));
      navigate(PURCHASE_RETURNS_PATH, { replace: true });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('common.error'));
    }
  }

  const steps: ChainStep[] = [
    ...(order
      ? [
          {
            key: 'order',
            label: t('documents.steps.purchaseOrder'),
            detail: order.poNumber,
            state: 'done' as const,
            to: `${PURCHASE_ORDERS_PATH}/${order.id}`,
          },
        ]
      : []),
    {
      key: 'receipt',
      label: t('documents.steps.goodsReceipt'),
      detail: receipt?.receiptNumber,
      state: 'done',
      to: `${GOODS_RECEIPTS_PATH}/${purchaseReturn.goodsReceiptId}`,
    },
    {
      key: 'return',
      label: t('documents.steps.purchaseReturn'),
      detail: purchaseReturn.returnNumber,
      state: status === 'confirmed' ? 'done' : 'current',
    },
    ...(debitNote
      ? [
          {
            key: 'debitNote',
            label: t('documents.steps.debitNote'),
            detail: debitNote.debitNoteNumber,
            state: 'done' as const,
            to: `${DEBIT_NOTES_PATH}/${debitNote.id}`,
          },
        ]
      : []),
  ];

  return (
    <div className="flex flex-col">
      <DocumentHeaderBar
        backTo={PURCHASE_RETURNS_PATH}
        backLabel={t('documents.back')}
        eyebrow={t('purchases.tabs.purchaseReturns')}
        title={<span className="tabular">{purchaseReturn.returnNumber}</span>}
        status={
          <Badge variant={PURCHASE_RETURN_STATUS_VARIANT[status]} dot>
            {t(purchaseReturnStatusLabelKey(status))}
          </Badge>
        }
        actions={
          <>
            <PrintButton documentType="purchase_return" id={purchaseReturn.id} />
            <Can permission={PURCH_WRITE}>
              <>
                {isDraft || status === 'cancelled' ? (
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
                {isDraft ? (
                  <>
                    <Can permission={PURCH.cancel}>
                      <Button
                        variant="outline"
                        disabled={busy}
                        onClick={() =>
                          void run(
                            cancelReturn,
                            'purchases.purchaseReturns.cancelSuccess',
                            'purchases.purchaseReturns.cancelError',
                            'purchases.purchaseReturns.cancelConfirm',
                            'danger',
                          )
                        }
                      >
                        <Ban />
                        {t('purchases.purchaseReturns.cancel')}
                      </Button>
                    </Can>
                    <Can permission={PURCH.post}>
                      <Button
                        disabled={busy}
                        onClick={() =>
                          void run(
                            confirmReturn,
                            'purchases.purchaseReturns.confirmSuccess',
                            'purchases.purchaseReturns.confirmError',
                            'purchases.purchaseReturns.confirmConfirm',
                          )
                        }
                      >
                        <CheckCircle2 />
                        {t('purchases.purchaseReturns.confirm')}
                      </Button>
                    </Can>
                  </>
                ) : null}
              </>
            </Can>
          </>
        }
      />

      <DocumentChain steps={steps} label={t('documents.chain')} />

      <DocumentBody
        main={
          <>
            <SectionCard title={t('documents.info')}>
              <InfoGrid
                items={[
                  { label: t('purchases.purchaseOrders.supplier'), value: supplier?.name },
                  {
                    label: t('purchases.purchaseReturns.goodsReceipt'),
                    value: (
                      <Link className="tabular text-primary hover:underline" to={`${GOODS_RECEIPTS_PATH}/${purchaseReturn.goodsReceiptId}`}>
                        {receipt?.receiptNumber ?? '…'}
                      </Link>
                    ),
                  },
                  {
                    label: t('purchases.purchaseReturns.returnDate'),
                    value: <span className="tabular">{formatDate(purchaseReturn.returnDate ?? purchaseReturn.createdAt)}</span>,
                  },
                  ...(purchaseReturn.notes ? [{ label: t('documents.notes'), value: purchaseReturn.notes, wide: true }] : []),
                ]}
              />
            </SectionCard>

            <SectionCard title={t('documents.lines')} description={`${t('documents.linesCount')}: ${purchaseReturn.lines.length}`} flush>
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-10 text-center">#</TableHead>
                    <TableHead>{t('purchases.purchaseReturns.lineProduct')}</TableHead>
                    <TableHead className="text-end">{t('purchases.purchaseReturns.lineQuantityReturned')}</TableHead>
                    <TableHead>{t('purchases.purchaseReturns.lineReason')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {purchaseReturn.lines.map((line, index) => {
                    const variant = variantIndex.get(line.productVariantId);
                    return (
                      <TableRow key={line.id}>
                        <TableCell className="text-center text-muted-foreground">{index + 1}</TableCell>
                        <TableCell>
                          <div className="flex flex-col leading-snug">
                            <span className="font-medium">{variant?.productName ?? '—'}</span>
                            <span className="text-xs text-muted-foreground">
                              {variant?.sku}
                              {line.notes ? ` · ${line.notes}` : ''}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-end">
                          <QuantityWithUnit quantity={line.quantityReturned} productVariantId={line.productVariantId} unitOfMeasureId={line.unitOfMeasureId} />
                        </TableCell>
                        <TableCell className="text-muted-foreground">{line.reason ?? '—'}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </SectionCard>
          </>
        }
        side={
          <>
            <TotalsPanel
              title={t('documents.summary')}
              rows={[{ label: t('documents.linesCount'), value: purchaseReturn.lines.length }]}
              totalLabel={t('documents.quantityTotal')}
              totalValue={<span className="tabular-nums">{quantityTotal}</span>}
            />
            {status === 'confirmed' ? (
              <SectionCard title={t('purchases.debitNotes.single')}>
                {debitNote ? (
                  <InfoGrid
                    items={[
                      {
                        label: t('purchases.debitNotes.number'),
                        value: (
                          <Link className="tabular text-primary hover:underline" to={`${DEBIT_NOTES_PATH}/${debitNote.id}`}>
                            {debitNote.debitNoteNumber}
                          </Link>
                        ),
                        wide: true,
                      },
                      {
                        label: t('documents.total'),
                        value: <Amount value={debitNote.totalAmount.amountMinorUnits} currency={debitNote.totalAmount.currency} />,
                        wide: true,
                      },
                    ]}
                  />
                ) : (
                  <p className="text-sm text-muted-foreground">{t('purchases.debitNotes.noneForReturn')}</p>
                )}
              </SectionCard>
            ) : null}
            <DocumentHistory entityType="purchase_return" entityId={purchaseReturn.id} />
          </>
        }
      />
    </div>
  );
}

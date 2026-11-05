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
} from '@erp-platform/ui';
import { CheckCircle2, FileQuestion, Info } from 'lucide-react';

import { useCustomer } from '../../api/customers/queries';
import { useDelivery } from '../../api/deliveries/queries';
import { useSalesOrder } from '../../api/sales-orders/queries';
import { useSalesCreditNotesBySalesReturn } from '../../api/sales-credit-notes/queries';
import {
  useCancelSalesReturn,
  useConfirmSalesReturn,
  useDeleteSalesReturn,
  useSalesReturn,
} from '../../api/sales-returns/queries';
import { useVariantIndex } from '../../hooks/sales-returns/use-variant-index';
import { ApiError } from '../../../../lib/api-client';
import { formatDate } from '../../../../lib/format-date';
import { confirmDialog } from '../../../../components/feedback/confirm-dialog';
import {
  DocumentBody,
  DocumentHeaderBar,
  InfoGrid,
  SectionCard,
  TotalsPanel,
} from '../../../../components/document/document-layout';
import { DocumentHistory } from '../../../../components/document/document-history';
import { QuantityWithUnit } from '../../../../components/product/unit-select';
import { PrintButton } from '../../../../components/printing/print-button';
import { SALES_RETURNS_PATH, SALES_RETURN_STATUS_VARIANT, salesReturnStatusLabelKey } from './sales-return-status';

/** /sales/sales-returns/:id — the return with its actions, lines, credit note link and history. */
export function SalesReturnDetailsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { data: salesReturn, isLoading, isError } = useSalesReturn(id);
  const { data: delivery } = useDelivery(salesReturn?.deliveryId);
  const { data: order } = useSalesOrder(delivery?.salesOrderId);
  const { data: customer } = useCustomer(order?.customerId);
  // Exists only once the return is confirmed — confirm() issues exactly one credit note.
  const { data: creditNotes } = useSalesCreditNotesBySalesReturn(
    salesReturn?.status === 'confirmed' ? salesReturn.id : null,
  );
  const creditNote = creditNotes?.[0] ?? null;
  const variantIndex = useVariantIndex();
  const confirmReturn = useConfirmSalesReturn();
  const cancelReturn = useCancelSalesReturn();
  const deleteReturn = useDeleteSalesReturn();
  const pending = confirmReturn.isPending || cancelReturn.isPending || deleteReturn.isPending;

  const quantityTotal = useMemo(
    () => (salesReturn?.lines ?? []).reduce((sum, line) => sum + line.quantityReturned, 0),
    [salesReturn],
  );

  if (isLoading) {
    return (
      <div className="flex flex-col gap-5">
        <Skeleton className="h-14 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (isError || !salesReturn) {
    return (
      <EmptyState
        icon={<FileQuestion />}
        title={t('documents.notFound')}
        action={
          <Button variant="outline" asChild>
            <Link to={SALES_RETURNS_PATH}>{t('documents.back')}</Link>
          </Button>
        }
      />
    );
  }

  const returnId = salesReturn.id;
  const isDraft = salesReturn.status === 'draft';

  async function run(action: { mutateAsync: (id: string) => Promise<unknown> }, successKey: string, errorKey: string) {
    try {
      await action.mutateAsync(returnId);
      toast.success(t(successKey));
      return true;
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t(errorKey));
      return false;
    }
  }

  async function handleConfirm() {
    if (!(await confirmDialog(t('sales.salesReturns.confirmConfirm')))) return;
    // Confirming also issues the credit note in the same transaction — say so.
    await run(confirmReturn, 'sales.salesReturns.confirmSuccessWithCreditNote', 'sales.salesReturns.confirmError');
  }

  async function handleCancel() {
    if (!(await confirmDialog(t('sales.salesReturns.cancelConfirm'), { tone: 'danger' }))) return;
    await run(cancelReturn, 'sales.salesReturns.cancelSuccess', 'sales.salesReturns.cancelError');
  }

  async function handleDelete() {
    if (!(await confirmDialog(t('sales.salesReturns.deleteConfirm'), { tone: 'danger' }))) return;
    if (await run(deleteReturn, 'sales.salesReturns.deleteSuccess', 'common.error')) navigate(SALES_RETURNS_PATH);
  }

  return (
    <div className="flex flex-col">
      <DocumentHeaderBar
        backTo={SALES_RETURNS_PATH}
        backLabel={t('documents.back')}
        eyebrow={t('sales.tabs.salesReturns')}
        title={<span className="tabular">{salesReturn.returnNumber}</span>}
        status={
          <Badge variant={SALES_RETURN_STATUS_VARIANT[salesReturn.status]} dot>
            {t(salesReturnStatusLabelKey(salesReturn.status))}
          </Badge>
        }
        actions={
          <>
            <PrintButton documentType="sales_return" id={salesReturn.id} />
            <Can permission="sales.manage">
              {isDraft || salesReturn.status === 'cancelled' ? (
                <Button
                  variant="ghost"
                  className="text-danger hover:bg-danger-soft hover:text-danger"
                  disabled={pending}
                  onClick={() => void handleDelete()}
                >
                  {t('common.delete')}
                </Button>
              ) : null}
              {isDraft ? (
                <>
                  <Button variant="outline" disabled={pending} onClick={() => void handleCancel()}>
                    {t('sales.salesReturns.cancel')}
                  </Button>
                  <Button disabled={pending} onClick={() => void handleConfirm()}>
                    <CheckCircle2 />
                    {t('sales.salesReturns.confirm')}
                  </Button>
                </>
              ) : null}
            </Can>
          </>
        }
      />

      <DocumentBody
        main={
          <>
            {isDraft ? (
              <div className="flex items-start gap-2.5 rounded-xl border border-info/20 bg-info-soft px-4 py-3 text-[13px] text-info">
                <Info className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{t('sales.salesReturns.draftNote')}</span>
              </div>
            ) : null}

            <SectionCard title={t('documents.info')}>
              <InfoGrid
                items={[
                  {
                    label: t('sales.salesReturns.customer'),
                    value: customer ? (
                      <Link className="text-primary hover:underline" to={`/sales/customers/${customer.id}/statement`}>
                        {customer.name}
                      </Link>
                    ) : (
                      '—'
                    ),
                  },
                  {
                    label: t('sales.salesReturns.delivery'),
                    value: delivery ? (
                      <Link className="tabular text-primary hover:underline" to={`/sales/deliveries/${delivery.id}`}>
                        {delivery.deliveryNumber}
                      </Link>
                    ) : (
                      '—'
                    ),
                  },
                  {
                    label: t('sales.salesReturns.returnDate'),
                    value: <span className="tabular">{formatDate(salesReturn.returnDate)}</span>,
                  },
                  ...(creditNote
                    ? [
                        {
                          label: t('sales.salesReturns.creditNote'),
                          value: (
                            <Link
                              className="tabular text-primary hover:underline"
                              to={`/sales/sales-credit-notes/${creditNote.id}`}
                            >
                              {creditNote.creditNoteNumber}
                            </Link>
                          ),
                        },
                      ]
                    : []),
                  ...(salesReturn.notes ? [{ label: t('documents.notes'), value: salesReturn.notes, wide: true }] : []),
                ]}
              />
            </SectionCard>

            <SectionCard
              title={t('documents.lines')}
              description={`${t('documents.linesCount')}: ${salesReturn.lines.length}`}
              flush
            >
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-10 text-center">#</TableHead>
                    <TableHead>{t('sales.salesReturns.lineProduct')}</TableHead>
                    <TableHead className="text-end">{t('sales.salesReturns.lineQuantityReturned')}</TableHead>
                    <TableHead>{t('sales.salesReturns.lineReason')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {salesReturn.lines.map((line, index) => {
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
                          <QuantityWithUnit
                            quantity={line.quantityReturned}
                            productVariantId={line.productVariantId}
                            unitOfMeasureId={line.unitOfMeasureId}
                          />
                        </TableCell>
                        <TableCell className="text-muted-foreground">{line.reason ?? '—'}</TableCell>
                      </TableRow>
                    );
                  })}
                  {salesReturn.lines.length === 0 ? (
                    <TableRow className="hover:bg-transparent">
                      <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                        {t('documents.emptyLines')}
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </SectionCard>
          </>
        }
        side={
          <>
            <TotalsPanel
              title={t('documents.summary')}
              rows={[{ label: t('documents.linesCount'), value: salesReturn.lines.length }]}
              totalLabel={t('documents.quantityTotal')}
              totalValue={quantityTotal}
            />
            <DocumentHistory entityType="sales_return" entityId={salesReturn.id} />
          </>
        }
      />
    </div>
  );
}

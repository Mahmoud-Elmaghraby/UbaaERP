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
import { ArrowLeftRight, Ban, Check, FileQuestion, Pencil, Send, Trash2, X } from 'lucide-react';

import { useCustomer } from '../../api/customers/queries';
import {
  useAcceptQuotation,
  useCancelQuotation,
  useDeleteQuotation,
  useQuotation,
  useRejectQuotation,
  useSendQuotation,
} from '../../api/quotations/queries';
import { useCreateSalesOrder, useSalesOrders } from '../../api/sales-orders/queries';
import { useVariantIndex } from '../../../../components/product/use-variant-index';
import { ApiError } from '../../../../lib/api-client';
import { FEATURE_KEYS } from '../../../../lib/feature-keys';
import { formatDate, todayIso } from '../../../../lib/format-date';
import { multiplyMinorUnits } from '../../../../lib/money';
import { Amount, AMOUNT_CELL } from '../../../../components/amount';
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
import { PrintButton } from '../../../../components/printing/print-button';
import {
  QUOTATION_STATUS_VARIANT,
  QUOTATIONS_PATH,
  isQuotationExpired,
  quotationStatusLabelKey,
} from './quotation-status';
import { SALES, SALES_WRITE } from '../../../../lib/permissions';

const SALES_ORDERS_PATH = '/sales/sales-orders';

/** /sales/quotations/:id — one quotation, its actions by status, and "convert to sales order". */
export function QuotationPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { data: quotation, isLoading, isError } = useQuotation(id);
  const { data: customer } = useCustomer(quotation?.customerId);
  const variantIndex = useVariantIndex();
  const salesOrdersEnabled = useHasFeature(FEATURE_KEYS.SALES_SALES_ORDERS);
  const { data: salesOrders } = useSalesOrders(salesOrdersEnabled);

  const sendQuotation = useSendQuotation();
  const acceptQuotation = useAcceptQuotation();
  const rejectQuotation = useRejectQuotation();
  const cancelQuotation = useCancelQuotation();
  const deleteQuotation = useDeleteQuotation();
  const createOrder = useCreateSalesOrder();
  const busy =
    sendQuotation.isPending ||
    acceptQuotation.isPending ||
    rejectQuotation.isPending ||
    cancelQuotation.isPending ||
    deleteQuotation.isPending ||
    createOrder.isPending;

  // The backend doesn't stop a second order from the same quotation, so the page
  // offers "convert" only while no order references it yet.
  const order = useMemo(
    () => (salesOrders ?? []).find((o) => o.sourceQuotationId === id && o.status !== 'cancelled'),
    [salesOrders, id],
  );

  if (isLoading) {
    return (
      <div className="flex flex-col gap-5">
        <Skeleton className="h-14 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (isError || !quotation) {
    return (
      <EmptyState
        icon={<FileQuestion />}
        title={t('documents.notFound')}
        action={
          <Button variant="outline" asChild>
            <Link to={QUOTATIONS_PATH}>{t('documents.back')}</Link>
          </Button>
        }
      />
    );
  }

  const { status } = quotation;
  const currency = quotation.totalAmount.currency;
  const expired = isQuotationExpired(quotation, todayIso());
  const quantityTotal = quotation.lines.reduce((sum, line) => sum + line.quantity, 0);

  async function run(
    mutation: { mutateAsync: (id: string) => Promise<unknown> },
    successKey: string,
    errorKey: string,
    confirmKey?: string,
  ) {
    if (confirmKey && !(await confirmDialog(t(confirmKey), { tone: 'danger' }))) return;
    try {
      await mutation.mutateAsync(quotation!.id);
      toast.success(t(successKey));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t(errorKey));
    }
  }

  async function handleDelete() {
    if (!(await confirmDialog(t('sales.quotations.deleteConfirm'), { tone: 'danger' }))) return;
    try {
      await deleteQuotation.mutateAsync(quotation!.id);
      toast.success(t('sales.quotations.deleteSuccess'));
      navigate(QUOTATIONS_PATH, { replace: true });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('common.error'));
    }
  }

  async function handleConvert() {
    try {
      const created = await createOrder.mutateAsync({ sourceQuotationId: quotation!.id });
      toast.success(t('sales.quotations.convertSuccess', { number: created.soNumber }));
      navigate(`${SALES_ORDERS_PATH}/${created.id}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('sales.salesOrders.createError'));
    }
  }

  const steps: ChainStep[] = [
    {
      key: 'quotation',
      label: t('documents.steps.quotation'),
      detail: quotation.quotationNumber,
      state: status === 'accepted' ? 'done' : 'current',
    },
  ];
  if (salesOrdersEnabled) {
    steps.push({
      key: 'order',
      label: t('documents.steps.salesOrder'),
      detail: order?.soNumber,
      state: order ? 'done' : status === 'accepted' ? 'current' : 'upcoming',
      to: order ? `${SALES_ORDERS_PATH}/${order.id}` : undefined,
    });
  }

  return (
    <div className="flex flex-col">
      <DocumentHeaderBar
        backTo={QUOTATIONS_PATH}
        backLabel={t('documents.back')}
        eyebrow={t('sales.tabs.quotations')}
        title={<span className="tabular">{quotation.quotationNumber}</span>}
        status={
          <>
            <Badge variant={QUOTATION_STATUS_VARIANT[status]} dot>
              {t(quotationStatusLabelKey(status))}
            </Badge>
            {expired ? <Badge variant="danger">{t('sales.quotations.expired')}</Badge> : null}
          </>
        }
        actions={
          <>
            <PrintButton documentType="quotation" id={quotation.id} />
            <Can permission={SALES_WRITE}>
              <>
                {status === 'draft' || status === 'cancelled' ? (
                  <Can permission={SALES.cancel}>
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
                {status === 'draft' || status === 'sent' ? (
                  <Can permission={SALES.cancel}>
                    <Button
                      variant="outline"
                      disabled={busy}
                      onClick={() =>
                        void run(
                          cancelQuotation,
                          'sales.quotations.cancelSuccess',
                          'sales.quotations.cancelError',
                          'sales.quotations.cancelConfirm',
                        )
                      }
                    >
                      <Ban />
                      {t('sales.quotations.cancel')}
                    </Button>
                  </Can>
                ) : null}
                {status === 'draft' ? (
                  <>
                    <Can permission={SALES.create}>
                      <Button variant="outline" asChild>
                        <Link to={`${QUOTATIONS_PATH}/${quotation.id}/edit`}>
                          <Pencil />
                          {t('common.edit')}
                        </Link>
                      </Button>
                    </Can>
                    <Can permission={SALES.create}>
                      <Button
                        disabled={busy}
                        onClick={() => void run(sendQuotation, 'sales.quotations.sendSuccess', 'sales.quotations.sendError')}
                      >
                        <Send />
                        {t('sales.quotations.send')}
                      </Button>
                    </Can>
                  </>
                ) : null}
                {status === 'sent' ? (
                  <>
                    <Can permission={SALES.create}>
                      <Button
                        variant="outline"
                        disabled={busy}
                        onClick={() =>
                          void run(
                            rejectQuotation,
                            'sales.quotations.rejectSuccess',
                            'sales.quotations.rejectError',
                            'sales.quotations.rejectConfirm',
                          )
                        }
                      >
                        <X />
                        {t('sales.quotations.reject')}
                      </Button>
                    </Can>
                    <Can permission={SALES.create}>
                      <Button
                        disabled={busy}
                        onClick={() =>
                          void run(acceptQuotation, 'sales.quotations.acceptSuccess', 'sales.quotations.acceptError')
                        }
                      >
                        <Check />
                        {t('sales.quotations.accept')}
                      </Button>
                    </Can>
                  </>
                ) : null}
                {status === 'accepted' && salesOrdersEnabled ? (
                  order ? (
                    <Button variant="outline" asChild>
                      <Link to={`${SALES_ORDERS_PATH}/${order.id}`}>
                        {t('sales.quotations.openOrder', { number: order.soNumber })}
                      </Link>
                    </Button>
                  ) : (
                    <Can permission={SALES.create}>
                      <Button disabled={busy || !salesOrders} onClick={() => void handleConvert()}>
                        <ArrowLeftRight />
                        {t('sales.quotations.convertToOrder')}
                      </Button>
                    </Can>
                  )
                ) : null}
              </>
            </Can>
          </>
        }
      />

      {steps.length > 1 ? <DocumentChain steps={steps} label={t('documents.chain')} /> : null}

      <DocumentBody
        main={
          <>
            <SectionCard title={t('documents.info')}>
              <InfoGrid
                items={[
                  { label: t('sales.quotations.customer'), value: customer?.name },
                  {
                    label: t('sales.quotations.date'),
                    value: <span className="tabular">{formatDate(quotation.createdAt)}</span>,
                  },
                  {
                    label: t('sales.quotations.validUntilDate'),
                    value: (
                      <span className={expired ? 'tabular text-danger' : 'tabular'}>
                        {formatDate(quotation.validUntilDate)}
                      </span>
                    ),
                  },
                  ...(quotation.notes ? [{ label: t('documents.notes'), value: quotation.notes, wide: true }] : []),
                ]}
              />
            </SectionCard>

            <SectionCard
              title={t('documents.lines')}
              description={`${t('documents.linesCount')}: ${quotation.lines.length}`}
              flush
            >
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-10 text-center">#</TableHead>
                    <TableHead>{t('sales.quotations.lineProduct')}</TableHead>
                    <TableHead className="text-end">{t('documents.quantity')}</TableHead>
                    <TableHead className="text-end">{t('documents.unitPrice')}</TableHead>
                    <TableHead className="text-end">{t('documents.lineTotal')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {quotation.lines.map((line, index) => {
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
                            quantity={line.quantity}
                            productVariantId={line.productVariantId}
                            unitOfMeasureId={line.unitOfMeasureId}
                          />
                        </TableCell>
                        <TableCell className={AMOUNT_CELL}>
                          <Amount value={line.unitPrice.amountMinorUnits} hideCurrency />
                        </TableCell>
                        <TableCell className={`${AMOUNT_CELL} font-semibold`}>
                          <Amount value={multiplyMinorUnits(line.unitPrice.amountMinorUnits, line.quantity)} hideCurrency />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {quotation.lines.length === 0 ? (
                    <TableRow className="hover:bg-transparent">
                      <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
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
              rows={[
                { label: t('documents.linesCount'), value: quotation.lines.length },
                { label: t('documents.quantityTotal'), value: quantityTotal },
              ]}
              totalLabel={t('documents.total')}
              totalValue={<Amount value={quotation.totalAmount.amountMinorUnits} hideCurrency />}
              currency={currency}
            />
            {customer ? (
              <SectionCard title={t('documents.partyDetails')}>
                <InfoGrid
                  items={[
                    { label: t('sales.quotations.customer'), value: customer.name, wide: true },
                    { label: t('documents.code'), value: <span className="tabular">{customer.code}</span>, wide: true },
                    ...(customer.phone
                      ? [{ label: t('documents.phone'), value: <span dir="ltr">{customer.phone}</span>, wide: true }]
                      : []),
                  ]}
                />
              </SectionCard>
            ) : null}
            <DocumentHistory entityType="quotation" entityId={quotation.id} />
          </>
        }
      />
    </div>
  );
}

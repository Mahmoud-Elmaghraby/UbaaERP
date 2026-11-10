import { useMemo } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { SalesOrderLineDto } from '@erp-platform/contracts';
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
import { Ban, CheckCircle2, FileQuestion, FileText, Pencil, Trash2, Truck } from 'lucide-react';

import { AttachmentsPanel } from '../../../attachments/components/attachments-panel';
import { useCustomer, useCustomerCreditCheck } from '../../api/customers/queries';
import { CreditLimitCallout, confirmCreditLimit, isCreditBlocked } from '../../lib/credit-limit';
import { SalesLimitsCallout, confirmSalesLimits, useSalesLimitsCheck } from '../../lib/sales-limits';
import { useQuotation } from '../../api/quotations/queries';
import { useDeliveriesBySalesOrder } from '../../api/deliveries/queries';
import { useSalesInvoicesBySalesOrder } from '../../api/sales-invoices/queries';
import {
  useCancelSalesOrder,
  useConfirmSalesOrder,
  useDeleteSalesOrder,
  useSalesOrder,
} from '../../api/sales-orders/queries';
import { useVariantIndex } from '../../../../components/product/use-variant-index';
import { ApiError } from '../../../../lib/api-client';
import { FEATURE_KEYS } from '../../../../lib/feature-keys';
import { formatDate } from '../../../../lib/format-date';
import { multiplyMinorUnits } from '../../../../lib/money';
import { Amount, AMOUNT_CELL } from '../../../../components/amount';
import { confirmDialog } from '../../../../components/feedback/confirm-dialog';
import { useSalesRepName } from '../sales-reps/sales-rep-select';
import {
  DocumentBody,
  DocumentChain,
  DocumentHeaderBar,
  InfoGrid,
  PanelCard,
  SectionCard,
  TotalsPanel,
  type ChainStep,
} from '../../../../components/document/document-layout';
import { DocumentHistory } from '../../../../components/document/document-history';
import { lineDiscountText } from '../../../../components/document/direct-lines-editor';
import { QuantityWithUnit } from '../../../../components/product/unit-select';
import { PrintButton } from '../../../../components/printing/print-button';
import { SALES_ORDER_STATUS_VARIANT, SALES_ORDERS_PATH, salesOrderStatusLabelKey } from './sales-order-status';
import { SALES, SALES_WRITE } from '../../../../lib/permissions';

const QUOTATIONS_PATH = '/sales/quotations';
const DELIVERIES_PATH = '/sales/deliveries';
const SALES_INVOICES_PATH = '/sales/sales-invoices';

/** A line's amount after its own discount (minor units) — same rule as the backend. */
function lineNetMinor(line: SalesOrderLineDto): string {
  const gross = BigInt(multiplyMinorUnits(line.unitPrice.amountMinorUnits, line.quantity));
  let off = 0n;
  if (line.discountType === 'percentage' && line.discountPercentage !== null) {
    off = (gross * BigInt(Math.round(line.discountPercentage * 100))) / 10000n;
  } else if (line.discountType === 'fixed' && line.discountFixedAmount) {
    off = BigInt(line.discountFixedAmount.amountMinorUnits);
  }
  return (gross - off < 0n ? 0n : gross - off).toString();
}

/** /sales/sales-orders/:id — the order, its actions by status, and its document chain. */
export function SalesOrderPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { data: order, isLoading, isError } = useSalesOrder(id);
  const { data: customer } = useCustomer(order?.customerId);
  const quotationsEnabled = useHasFeature(FEATURE_KEYS.SALES_QUOTATIONS);
  const deliveriesEnabled = useHasFeature(FEATURE_KEYS.SALES_DELIVERIES);
  const { data: quotation } = useQuotation(quotationsEnabled ? order?.sourceQuotationId : null);
  const { data: deliveries } = useDeliveriesBySalesOrder(deliveriesEnabled ? order?.id : null);
  const { data: invoices } = useSalesInvoicesBySalesOrder(order?.id);
  const variantIndex = useVariantIndex();
  // Credit limit (migration 0109): checked before confirming a draft.
  const { data: creditCheck } = useCustomerCreditCheck(
    order?.status === 'draft' ? order.customerId : null,
    order?.totalAmount.amountMinorUnits,
    order?.totalAmount.currency,
  );
  const creditBlocked = isCreditBlocked(creditCheck);
  // Settings hub limits (discount, below cost / minimum price, required rep).
  const { data: limitsCheck } = useSalesLimitsCheck('sales-orders', order?.id, order?.status === 'draft');
  const limitsBlocked = Boolean(limitsCheck?.blocked);

  const confirmOrder = useConfirmSalesOrder();
  const cancelOrder = useCancelSalesOrder();
  const deleteOrder = useDeleteSalesOrder();
  const busy = confirmOrder.isPending || cancelOrder.isPending || deleteOrder.isPending;

  const liveDeliveries = useMemo(() => (deliveries ?? []).filter((d) => d.status !== 'cancelled'), [deliveries]);
  const liveInvoices = useMemo(() => (invoices ?? []).filter((i) => i.status !== 'cancelled'), [invoices]);
  const salesRepName = useSalesRepName(order?.salesRepId);

  if (isLoading) {
    return (
      <div className="flex flex-col gap-5">
        <Skeleton className="h-14 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (isError || !order) {
    return (
      <EmptyState
        icon={<FileQuestion />}
        title={t('documents.notFound')}
        action={
          <Button variant="outline" asChild>
            <Link to={SALES_ORDERS_PATH}>{t('documents.back')}</Link>
          </Button>
        }
      />
    );
  }

  const { status } = order;
  const isDraft = status === 'draft';
  const isOpen = status === 'confirmed' || status === 'partially_delivered';
  const isActive = isOpen || status === 'fully_delivered';
  const currency = order.totalAmount.currency;
  const headerDiscount = BigInt(order.totalAmount.amountMinorUnits) - BigInt(order.subtotalAmount.amountMinorUnits);

  async function run(
    mutation: { mutateAsync: (id: string) => Promise<unknown> },
    successKey: string,
    errorKey: string,
    confirmKey?: string,
  ) {
    if (confirmKey && !(await confirmDialog(t(confirmKey), { tone: 'danger' }))) return;
    try {
      await mutation.mutateAsync(order!.id);
      toast.success(t(successKey));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t(errorKey));
    }
  }

  async function handleDelete() {
    if (!(await confirmDialog(t('sales.salesOrders.deleteConfirm'), { tone: 'danger' }))) return;
    try {
      await deleteOrder.mutateAsync(order!.id);
      toast.success(t('sales.salesOrders.deleteSuccess'));
      navigate(SALES_ORDERS_PATH, { replace: true });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('common.error'));
    }
  }

  // quotation → order → deliveries → invoices, each step opening the real document.
  const steps: ChainStep[] = [];
  if (quotationsEnabled && order.sourceQuotationId) {
    steps.push({
      key: 'quotation',
      label: t('documents.steps.quotation'),
      detail: quotation?.quotationNumber,
      state: 'done',
      to: `${QUOTATIONS_PATH}/${order.sourceQuotationId}`,
    });
  }
  steps.push({
    key: 'order',
    label: t('documents.steps.salesOrder'),
    detail: order.soNumber,
    state: isDraft || status === 'cancelled' ? 'current' : 'done',
  });
  if (deliveriesEnabled) {
    if (liveDeliveries.length === 0) {
      steps.push({
        key: 'delivery',
        label: t('documents.steps.delivery'),
        state: isOpen ? 'current' : 'upcoming',
      });
    } else {
      for (const delivery of liveDeliveries) {
        steps.push({
          key: `delivery-${delivery.id}`,
          label: t('documents.steps.delivery'),
          detail: delivery.deliveryNumber,
          state: delivery.status === 'confirmed' ? 'done' : 'current',
          to: `${DELIVERIES_PATH}/${delivery.id}`,
        });
      }
    }
  }
  if (liveInvoices.length === 0) {
    steps.push({ key: 'invoice', label: t('documents.steps.invoice'), state: 'upcoming' });
  } else {
    for (const invoice of liveInvoices) {
      steps.push({
        key: `invoice-${invoice.id}`,
        label: t('documents.steps.invoice'),
        detail: invoice.invoiceNumber,
        state: invoice.status === 'posted' ? 'done' : 'current',
        to: `${SALES_INVOICES_PATH}/${invoice.id}`,
      });
    }
  }

  return (
    <div className="flex flex-col">
      <DocumentHeaderBar
        backTo={SALES_ORDERS_PATH}
        backLabel={t('documents.back')}
        eyebrow={t('sales.tabs.salesOrders')}
        title={<span className="tabular">{order.soNumber}</span>}
        status={
          <Badge variant={SALES_ORDER_STATUS_VARIANT[status]} dot>
            {t(salesOrderStatusLabelKey(status))}
          </Badge>
        }
        actions={
          <>
            <PrintButton documentType="sales_order" id={order.id} />
            <Can permission={SALES_WRITE}>
              <>
                {isDraft || status === 'cancelled' ? (
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
                {isDraft || status === 'confirmed' ? (
                  <Can permission={SALES.cancel}>
                    <Button
                      variant="outline"
                      disabled={busy}
                      onClick={() =>
                        void run(
                          cancelOrder,
                          'sales.salesOrders.cancelSuccess',
                          'sales.salesOrders.cancelError',
                          'sales.salesOrders.cancelConfirm',
                        )
                      }
                    >
                      <Ban />
                      {t('sales.salesOrders.cancel')}
                    </Button>
                  </Can>
                ) : null}
                {isDraft ? (
                  <>
                    <Can permission={SALES.create}>
                      <Button variant="outline" asChild>
                        <Link to={`${SALES_ORDERS_PATH}/${order.id}/edit`}>
                          <Pencil />
                          {t('common.edit')}
                        </Link>
                      </Button>
                    </Can>
                    <Can permission={SALES.post}>
                      <Button
                        disabled={busy || creditBlocked || limitsBlocked}
                        title={creditBlocked ? t('sales.creditLimit.blockedHint') : limitsBlocked ? t('sales.limits.blockedHint') : undefined}
                        onClick={async () => {
                          if (!(await confirmSalesLimits(limitsCheck, t))) return;
                          if (!(await confirmCreditLimit(creditCheck, t))) return;
                          void run(confirmOrder, 'sales.salesOrders.confirmSuccess', 'sales.salesOrders.confirmError');
                        }}
                      >
                        <CheckCircle2 />
                        {t('sales.salesOrders.confirm')}
                      </Button>
                    </Can>
                  </>
                ) : null}
                {deliveriesEnabled && isOpen ? (
                  <Can permission={SALES.create}>
                    <Button asChild>
                      <Link to={`${DELIVERIES_PATH}/new?salesOrderId=${order.id}`}>
                        <Truck />
                        {t('sales.salesOrders.createDelivery')}
                      </Link>
                    </Button>
                  </Can>
                ) : null}
                {isActive ? (
                  <Can permission={SALES.create}>
                    <Button variant={deliveriesEnabled && isOpen ? 'outline' : 'default'} asChild>
                      <Link to={`${SALES_INVOICES_PATH}/new?salesOrderId=${order.id}`}>
                        <FileText />
                        {t('sales.salesOrders.createInvoice')}
                      </Link>
                    </Button>
                  </Can>
                ) : null}
              </>
            </Can>
          </>
        }
      />

      <DocumentChain steps={steps} label={t('documents.chain')} />

      {isDraft && creditCheck?.exceeded ? (
        <div className="mb-5">
          <CreditLimitCallout check={creditCheck} />
        </div>
      ) : null}
      {isDraft ? (
        <div className="mb-5 empty:hidden">
          <SalesLimitsCallout check={limitsCheck} />
        </div>
      ) : null}

      <DocumentBody
        main={
          <>
            <SectionCard title={t('documents.info')}>
              <InfoGrid
                items={[
                  { label: t('sales.salesOrders.customer'), value: customer?.name },
                  {
                    label: t('sales.salesOrders.date'),
                    value: <span className="tabular">{formatDate(order.createdAt)}</span>,
                  },
                  ...(order.sourceQuotationId && quotationsEnabled
                    ? [
                        {
                          label: t('sales.salesOrders.sourceQuotation'),
                          value: (
                            <Link className="tabular text-primary hover:underline" to={`${QUOTATIONS_PATH}/${order.sourceQuotationId}`}>
                              {quotation?.quotationNumber ?? '…'}
                            </Link>
                          ),
                        },
                      ]
                    : []),
                  ...(salesRepName ? [{ label: t('salesReps.field'), value: salesRepName }] : []),
                  ...(order.notes ? [{ label: t('documents.notes'), value: order.notes, wide: true }] : []),
                ]}
              />
            </SectionCard>

            <SectionCard
              title={t('documents.lines')}
              description={`${t('documents.linesCount')}: ${order.lines.length}`}
              flush
            >
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-10 text-center">#</TableHead>
                    <TableHead>{t('sales.salesOrders.lineProduct')}</TableHead>
                    <TableHead className="text-end">{t('documents.quantity')}</TableHead>
                    <TableHead className="text-end">{t('documents.unitPrice')}</TableHead>
                    <TableHead className="text-end">{t('documents.lineDiscount')}</TableHead>
                    <TableHead className="text-end">{t('documents.lineTotal')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {order.lines.map((line, index) => {
                    const variant = variantIndex.get(line.productVariantId);
                    const discount = lineDiscountText(line);
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
                        <TableCell className={AMOUNT_CELL}>
                          {line.discountType === 'fixed' && line.discountFixedAmount ? (
                            <Amount value={line.discountFixedAmount.amountMinorUnits} hideCurrency />
                          ) : discount ? (
                            <span dir="ltr">{discount}</span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className={`${AMOUNT_CELL} font-semibold`}>
                          <Amount value={lineNetMinor(line)} hideCurrency />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {order.lines.length === 0 ? (
                    <TableRow className="hover:bg-transparent">
                      <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                        {t('documents.emptyLines')}
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </SectionCard>

            <PanelCard>
              <AttachmentsPanel entityType="sales_order" entityId={order.id} />
            </PanelCard>
          </>
        }
        side={
          <>
            <TotalsPanel
              title={t('documents.summary')}
              rows={[
                { label: t('documents.linesCount'), value: order.lines.length },
                {
                  label: t('sales.salesOrders.subtotalAmount'),
                  value: <Amount value={order.subtotalAmount.amountMinorUnits} hideCurrency />,
                },
                ...(headerDiscount !== 0n
                  ? [
                      {
                        label:
                          order.discountType === 'percentage'
                            ? `${t('sales.salesOrders.discountSectionTitle')} (${order.discountPercentage}%)`
                            : t('sales.salesOrders.discountSectionTitle'),
                        value: <Amount value={headerDiscount.toString()} hideCurrency />,
                        tone: 'danger' as const,
                      },
                    ]
                  : []),
              ]}
              totalLabel={t('documents.total')}
              totalValue={<Amount value={order.totalAmount.amountMinorUnits} hideCurrency />}
              currency={currency}
            />
            {customer ? (
              <SectionCard title={t('documents.partyDetails')}>
                <InfoGrid
                  items={[
                    { label: t('sales.salesOrders.customer'), value: customer.name, wide: true },
                    { label: t('documents.code'), value: <span className="tabular">{customer.code}</span>, wide: true },
                    ...(customer.phone
                      ? [{ label: t('documents.phone'), value: <span dir="ltr">{customer.phone}</span>, wide: true }]
                      : []),
                  ]}
                />
              </SectionCard>
            ) : null}
            <DocumentHistory entityType="sales_order" entityId={order.id} />
          </>
        }
      />
    </div>
  );
}

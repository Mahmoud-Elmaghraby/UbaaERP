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
import { Ban, CheckCircle2, FileQuestion, FileText, PackageCheck, Pencil, Trash2 } from 'lucide-react';

import { AttachmentsPanel } from '../../../attachments/components/attachments-panel';
import { useSupplier } from '../../api/suppliers/queries';
import { useSupplierQuotation } from '../../api/supplier-quotations/queries';
import { useGoodsReceiptsByPurchaseOrder } from '../../api/goods-receipts/queries';
import { usePurchaseInvoicesByPurchaseOrder } from '../../api/purchase-invoices/queries';
import {
  useCancelPurchaseOrder,
  useConfirmPurchaseOrder,
  useDeletePurchaseOrder,
  usePurchaseOrder,
} from '../../api/purchase-orders/queries';
import { ApiError } from '../../../../lib/api-client';
import { FEATURE_KEYS } from '../../../../lib/feature-keys';
import { formatDate } from '../../../../lib/format-date';
import { formatMoney, multiplyMinorUnits } from '../../../../lib/money';
import { useTenantSettings } from '../../../settings/queries';
import { WhatsAppShareButton } from '../../../../components/document/whatsapp-share';
import { Amount, AMOUNT_CELL } from '../../../../components/amount';
import { confirmDialog } from '../../../../components/feedback/confirm-dialog';
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
import { QuantityWithUnit } from '../../../../components/product/unit-select';
import { useVariantIndex } from '../../../../components/product/use-variant-index';
import { PrintButton } from '../../../../components/printing/print-button';
import { PURCHASE_ORDER_STATUS_VARIANT, PURCHASE_ORDERS_PATH, purchaseOrderStatusLabelKey } from './purchase-order-status';
import { PURCH, PURCH_WRITE } from '../../../../lib/permissions';

const RFQS_PATH = '/purchases/rfqs';
const GOODS_RECEIPTS_PATH = '/purchases/goods-receipts';
const PURCHASE_INVOICES_PATH = '/purchases/purchase-invoices';
const SUPPLIERS_PATH = '/purchases/suppliers';

/** /purchases/purchase-orders/:id — the order, its actions by status, and its document chain. */
export function PurchaseOrderPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { data: order, isLoading, isError } = usePurchaseOrder(id);
  const { data: supplier } = useSupplier(order?.supplierId);
  const quotationsEnabled = useHasFeature(FEATURE_KEYS.PURCHASES_SUPPLIER_QUOTATIONS);
  const receiptsEnabled = useHasFeature(FEATURE_KEYS.PURCHASES_GOODS_RECEIPTS);
  const { data: quotation } = useSupplierQuotation(quotationsEnabled ? order?.sourceQuotationId : null);
  const { data: receipts } = useGoodsReceiptsByPurchaseOrder(receiptsEnabled ? order?.id : null);
  const { data: invoices } = usePurchaseInvoicesByPurchaseOrder(order?.id);
  const variantIndex = useVariantIndex();
  const { data: settings } = useTenantSettings();

  const confirmOrder = useConfirmPurchaseOrder();
  const cancelOrder = useCancelPurchaseOrder();
  const deleteOrder = useDeletePurchaseOrder();
  const busy = confirmOrder.isPending || cancelOrder.isPending || deleteOrder.isPending;

  const liveReceipts = useMemo(() => (receipts ?? []).filter((r) => r.status !== 'cancelled'), [receipts]);
  const liveInvoices = useMemo(() => (invoices ?? []).filter((i) => i.status !== 'cancelled'), [invoices]);

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
            <Link to={PURCHASE_ORDERS_PATH}>{t('documents.back')}</Link>
          </Button>
        }
      />
    );
  }

  const { status } = order;
  const isDraft = status === 'draft';
  const isOpen = status === 'confirmed' || status === 'partially_received';
  const isActive = isOpen || status === 'fully_received';

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
    if (!(await confirmDialog(t('purchases.purchaseOrders.deleteConfirm'), { tone: 'danger' }))) return;
    try {
      await deleteOrder.mutateAsync(order!.id);
      toast.success(t('purchases.purchaseOrders.deleteSuccess'));
      navigate(PURCHASE_ORDERS_PATH, { replace: true });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('common.error'));
    }
  }

  // quotation → order → receipts → invoices, each step opening the real document.
  const steps: ChainStep[] = [];
  if (quotationsEnabled && order.sourceQuotationId && quotation) {
    steps.push({
      key: 'quotation',
      label: t('documents.steps.quotation'),
      state: 'done',
      to: `${RFQS_PATH}/${quotation.rfqId}`,
    });
  }
  steps.push({
    key: 'order',
    label: t('documents.steps.purchaseOrder'),
    detail: order.poNumber,
    state: isDraft || status === 'cancelled' ? 'current' : 'done',
  });
  if (receiptsEnabled) {
    if (liveReceipts.length === 0) {
      steps.push({ key: 'receipt', label: t('documents.steps.goodsReceipt'), state: isOpen ? 'current' : 'upcoming' });
    } else {
      for (const receipt of liveReceipts) {
        steps.push({
          key: `receipt-${receipt.id}`,
          label: t('documents.steps.goodsReceipt'),
          detail: receipt.receiptNumber,
          state: receipt.status === 'confirmed' ? 'done' : 'current',
          to: `${GOODS_RECEIPTS_PATH}/${receipt.id}`,
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
        to: `${PURCHASE_INVOICES_PATH}/${invoice.id}`,
      });
    }
  }

  return (
    <div className="flex flex-col">
      <DocumentHeaderBar
        backTo={PURCHASE_ORDERS_PATH}
        backLabel={t('documents.back')}
        eyebrow={t('purchases.tabs.purchaseOrders')}
        title={<span className="tabular">{order.poNumber}</span>}
        status={
          <Badge variant={PURCHASE_ORDER_STATUS_VARIANT[status]} dot>
            {t(purchaseOrderStatusLabelKey(status))}
          </Badge>
        }
        actions={
          <>
            <PrintButton documentType="purchase_order" id={order.id} />
            {status !== 'cancelled' ? (
              <Can permission={PURCH.view}>
                <WhatsAppShareButton
                  kind="purchase-orders"
                  documentId={order.id}
                  phone={supplier?.phone}
                  buildMessage={(url) =>
                    t('purchases.whatsapp.orderMessage', {
                      supplier: supplier?.name ?? '',
                      company: settings?.companyName ?? '',
                      number: order.poNumber,
                      total: formatMoney(order.totalAmount.amountMinorUnits, order.totalAmount.currency),
                      date: order.expectedDeliveryDate ? formatDate(order.expectedDeliveryDate) : '—',
                      url,
                    })
                  }
                />
              </Can>
            ) : null}
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
                {isDraft || status === 'confirmed' ? (
                  <Can permission={PURCH.cancel}>
                    <Button
                      variant="outline"
                      disabled={busy}
                      onClick={() =>
                        void run(
                          cancelOrder,
                          'purchases.purchaseOrders.cancelSuccess',
                          'purchases.purchaseOrders.cancelError',
                          'purchases.purchaseOrders.cancelConfirm',
                        )
                      }
                    >
                      <Ban />
                      {t('purchases.purchaseOrders.cancel')}
                    </Button>
                  </Can>
                ) : null}
                {isDraft ? (
                  <>
                    <Can permission={PURCH.create}>
                      <Button variant="outline" asChild>
                        <Link to={`${PURCHASE_ORDERS_PATH}/${order.id}/edit`}>
                          <Pencil />
                          {t('common.edit')}
                        </Link>
                      </Button>
                    </Can>
                    <Can permission={PURCH.post}>
                      <Button
                        disabled={busy}
                        onClick={() =>
                          void run(confirmOrder, 'purchases.purchaseOrders.confirmSuccess', 'purchases.purchaseOrders.confirmError')
                        }
                      >
                        <CheckCircle2 />
                        {t('purchases.purchaseOrders.confirm')}
                      </Button>
                    </Can>
                  </>
                ) : null}
                {receiptsEnabled && isOpen ? (
                  <Can permission={PURCH.create}>
                    <Button asChild>
                      <Link to={`${GOODS_RECEIPTS_PATH}/new?purchaseOrderId=${order.id}`}>
                        <PackageCheck />
                        {t('purchases.purchaseOrders.createReceipt')}
                      </Link>
                    </Button>
                  </Can>
                ) : null}
                {isActive ? (
                  <Can permission={PURCH.create}>
                    <Button variant={receiptsEnabled && isOpen ? 'outline' : 'default'} asChild>
                      <Link to={`${PURCHASE_INVOICES_PATH}/new?purchaseOrderId=${order.id}`}>
                        <FileText />
                        {t('purchases.purchaseOrders.createInvoice')}
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

      <DocumentBody
        main={
          <>
            <SectionCard title={t('documents.info')}>
              <InfoGrid
                items={[
                  { label: t('purchases.purchaseOrders.supplier'), value: supplier?.name },
                  { label: t('documents.date'), value: <span className="tabular">{formatDate(order.createdAt)}</span> },
                  {
                    label: t('purchases.purchaseOrders.expectedDeliveryDate'),
                    value: order.expectedDeliveryDate ? <span className="tabular">{formatDate(order.expectedDeliveryDate)}</span> : '—',
                  },
                  ...(order.notes ? [{ label: t('documents.notes'), value: order.notes, wide: true }] : []),
                ]}
              />
            </SectionCard>

            <SectionCard title={t('documents.lines')} description={`${t('documents.linesCount')}: ${order.lines.length}`} flush>
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-10 text-center">#</TableHead>
                    <TableHead>{t('purchases.purchaseOrders.lineProduct')}</TableHead>
                    <TableHead className="text-end">{t('documents.quantity')}</TableHead>
                    <TableHead className="text-end">{t('documents.unitPrice')}</TableHead>
                    <TableHead className="text-end">{t('documents.lineTotal')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {order.lines.map((line, index) => {
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
                          <QuantityWithUnit quantity={line.quantity} productVariantId={line.productVariantId} unitOfMeasureId={line.unitOfMeasureId} />
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
                  {order.lines.length === 0 ? (
                    <TableRow className="hover:bg-transparent">
                      <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                        {t('documents.emptyLines')}
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </SectionCard>

            <PanelCard>
              <AttachmentsPanel entityType="purchase_order" entityId={order.id} />
            </PanelCard>
          </>
        }
        side={
          <>
            <TotalsPanel
              title={t('documents.summary')}
              rows={[{ label: t('documents.linesCount'), value: order.lines.length }]}
              totalLabel={t('documents.total')}
              totalValue={<Amount value={order.totalAmount.amountMinorUnits} hideCurrency />}
              currency={order.totalAmount.currency}
            />
            {supplier ? (
              <SectionCard title={t('documents.partyDetails')}>
                <InfoGrid
                  items={[
                    {
                      label: t('purchases.purchaseOrders.supplier'),
                      value: (
                        <Link className="text-primary hover:underline" to={`${SUPPLIERS_PATH}/${supplier.id}`}>
                          {supplier.name}
                        </Link>
                      ),
                      wide: true,
                    },
                    { label: t('documents.code'), value: <span className="tabular">{supplier.code}</span>, wide: true },
                    ...(supplier.phone ? [{ label: t('documents.phone'), value: <span dir="ltr">{supplier.phone}</span>, wide: true }] : []),
                  ]}
                />
              </SectionCard>
            ) : null}
            <DocumentHistory entityType="purchase_order" entityId={order.id} />
          </>
        }
      />
    </div>
  );
}

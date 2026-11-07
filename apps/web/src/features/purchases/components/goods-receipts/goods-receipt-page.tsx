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
import { Ban, CheckCircle2, FileQuestion, Tags, Trash2, Undo2 } from 'lucide-react';
import type { LabelsPrefillState } from '../../../inventory/components/labels/labels-page';


import { useWarehouses } from '../../../inventory/api/warehouses/queries';
import { useSupplier } from '../../api/suppliers/queries';
import { usePurchaseOrder } from '../../api/purchase-orders/queries';
import { usePurchaseReturnsByGoodsReceipt } from '../../api/purchase-returns/queries';
import {
  useCancelGoodsReceipt,
  useConfirmGoodsReceipt,
  useDeleteGoodsReceipt,
  useGoodsReceipt,
} from '../../api/goods-receipts/queries';
import { ApiError } from '../../../../lib/api-client';
import { formatDate } from '../../../../lib/format-date';
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
import { LotsSummary } from '../../../../components/document/lot-entry';
import { QuantityWithUnit } from '../../../../components/product/unit-select';
import { useVariantIndex } from '../../../../components/product/use-variant-index';
import { PrintButton } from '../../../../components/printing/print-button';
import { GOODS_RECEIPT_STATUS_VARIANT, GOODS_RECEIPTS_PATH, goodsReceiptStatusLabelKey } from './goods-receipt-status';

const PURCHASE_ORDERS_PATH = '/purchases/purchase-orders';
const PURCHASE_RETURNS_PATH = '/purchases/purchase-returns';

/** /purchases/goods-receipts/:id — the receipt, confirm/cancel/delete, and returns made from it. */
export function GoodsReceiptPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { data: receipt, isLoading, isError } = useGoodsReceipt(id);
  const { data: order } = usePurchaseOrder(receipt?.purchaseOrderId);
  const { data: supplier } = useSupplier(order?.supplierId);
  const { data: warehouses } = useWarehouses();
  const { data: returns } = usePurchaseReturnsByGoodsReceipt(receipt?.status === 'confirmed' ? receipt.id : null);
  const variantIndex = useVariantIndex();

  const confirmReceipt = useConfirmGoodsReceipt();
  const cancelReceipt = useCancelGoodsReceipt();
  const deleteReceipt = useDeleteGoodsReceipt();
  const busy = confirmReceipt.isPending || cancelReceipt.isPending || deleteReceipt.isPending;
  const liveReturns = useMemo(() => (returns ?? []).filter((r) => r.status !== 'cancelled'), [returns]);

  if (isLoading) {
    return (
      <div className="flex flex-col gap-5">
        <Skeleton className="h-14 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (isError || !receipt) {
    return (
      <EmptyState
        icon={<FileQuestion />}
        title={t('documents.notFound')}
        action={
          <Button variant="outline" asChild>
            <Link to={GOODS_RECEIPTS_PATH}>{t('documents.back')}</Link>
          </Button>
        }
      />
    );
  }

  const { status } = receipt;
  const isDraft = status === 'draft';
  const warehouse = warehouses?.find((w) => w.id === receipt.warehouseId);
  const currency = receipt.lines[0]?.unitCost.currency;
  const lineTotals = receipt.lines.map((line) => multiplyMinorUnits(line.unitCost.amountMinorUnits, line.quantityReceived));
  const total = lineTotals.reduce((sum, value) => sum + BigInt(value), 0n);
  const quantityTotal = receipt.lines.reduce((sum, line) => sum + line.quantityReceived, 0);

  async function run(
    mutation: { mutateAsync: (id: string) => Promise<unknown> },
    successKey: string,
    errorKey: string,
    confirmKey: string,
    tone?: 'danger',
  ) {
    if (!(await confirmDialog(t(confirmKey), tone ? { tone } : {}))) return;
    try {
      await mutation.mutateAsync(receipt!.id);
      toast.success(t(successKey));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t(errorKey));
    }
  }

  async function handleDelete() {
    if (!(await confirmDialog(t('purchases.goodsReceipts.deleteConfirm'), { tone: 'danger' }))) return;
    try {
      await deleteReceipt.mutateAsync(receipt!.id);
      toast.success(t('purchases.goodsReceipts.deleteSuccess'));
      navigate(GOODS_RECEIPTS_PATH, { replace: true });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('common.error'));
    }
  }

  const steps: ChainStep[] = [
    {
      key: 'order',
      label: t('documents.steps.purchaseOrder'),
      detail: order?.poNumber,
      state: 'done',
      to: `${PURCHASE_ORDERS_PATH}/${receipt.purchaseOrderId}`,
    },
    {
      key: 'receipt',
      label: t('documents.steps.goodsReceipt'),
      detail: receipt.receiptNumber,
      state: status === 'confirmed' ? 'done' : 'current',
    },
    ...liveReturns.map<ChainStep>((r) => ({
      key: `return-${r.id}`,
      label: t('documents.steps.purchaseReturn'),
      detail: r.returnNumber,
      state: r.status === 'confirmed' ? 'done' : 'current',
      to: `${PURCHASE_RETURNS_PATH}/${r.id}`,
    })),
  ];

  return (
    <div className="flex flex-col">
      <DocumentHeaderBar
        backTo={GOODS_RECEIPTS_PATH}
        backLabel={t('documents.back')}
        eyebrow={t('purchases.tabs.goodsReceipts')}
        title={<span className="tabular">{receipt.receiptNumber}</span>}
        status={
          <Badge variant={GOODS_RECEIPT_STATUS_VARIANT[status]} dot>
            {t(goodsReceiptStatusLabelKey(status))}
          </Badge>
        }
        actions={
          <>
            <PrintButton documentType="goods_receipt" id={receipt.id} />
            <Button
              variant="outline"
              onClick={() => {
                // One label per piece received (quantities are in the line's unit × its factor).
                const copies = new Map<string, number>();
                for (const line of receipt.lines) {
                  copies.set(line.productVariantId, (copies.get(line.productVariantId) ?? 0) + line.quantityReceived * (line.unitFactor || 1));
                }
                const state: LabelsPrefillState = {
                  labels: [...copies].map(([variantId, count]) => ({ variantId, copies: Math.max(1, Math.min(500, Math.round(count))) })),
                };
                navigate('/inventory/labels', { state });
              }}
            >
              <Tags />
              {t('purchases.goodsReceipts.printLabels')}
            </Button>
            <Can permission="purchases.manage">
              <>
                {isDraft || status === 'cancelled' ? (
                  <Button
                    variant="ghost"
                    className="text-danger hover:bg-danger-soft hover:text-danger"
                    disabled={busy}
                    onClick={() => void handleDelete()}
                  >
                    <Trash2 />
                    {t('common.delete')}
                  </Button>
                ) : null}
                {isDraft ? (
                  <>
                    <Button
                      variant="outline"
                      disabled={busy}
                      onClick={() =>
                        void run(
                          cancelReceipt,
                          'purchases.goodsReceipts.cancelSuccess',
                          'purchases.goodsReceipts.cancelError',
                          'purchases.goodsReceipts.cancelConfirm',
                          'danger',
                        )
                      }
                    >
                      <Ban />
                      {t('purchases.goodsReceipts.cancel')}
                    </Button>
                    <Button
                      disabled={busy}
                      onClick={() =>
                        void run(
                          confirmReceipt,
                          'purchases.goodsReceipts.confirmSuccess',
                          'purchases.goodsReceipts.confirmError',
                          'purchases.goodsReceipts.confirmConfirm',
                        )
                      }
                    >
                      <CheckCircle2 />
                      {t('purchases.goodsReceipts.confirm')}
                    </Button>
                  </>
                ) : null}
                {status === 'confirmed' ? (
                  <Button variant="outline" asChild>
                    <Link to={`${PURCHASE_RETURNS_PATH}/new?goodsReceiptId=${receipt.id}`}>
                      <Undo2 />
                      {t('purchases.goodsReceipts.createReturn')}
                    </Link>
                  </Button>
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
                    label: t('purchases.goodsReceipts.purchaseOrder'),
                    value: (
                      <Link className="tabular text-primary hover:underline" to={`${PURCHASE_ORDERS_PATH}/${receipt.purchaseOrderId}`}>
                        {order?.poNumber ?? '…'}
                      </Link>
                    ),
                  },
                  { label: t('purchases.goodsReceipts.warehouse'), value: warehouse?.name },
                  {
                    label: t('purchases.goodsReceipts.receivedDate'),
                    value: <span className="tabular">{formatDate(receipt.receivedDate ?? receipt.createdAt)}</span>,
                  },
                  ...(receipt.exchangeRate
                    ? [{ label: t('purchases.goodsReceipts.exchangeRateShort'), value: <bdi dir="ltr">{receipt.exchangeRate}</bdi> }]
                    : []),
                  ...(receipt.notes ? [{ label: t('documents.notes'), value: receipt.notes, wide: true }] : []),
                ]}
              />
            </SectionCard>

            <SectionCard title={t('documents.lines')} description={`${t('documents.linesCount')}: ${receipt.lines.length}`} flush>
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-10 text-center">#</TableHead>
                    <TableHead>{t('purchases.goodsReceipts.lineProduct')}</TableHead>
                    <TableHead className="text-end">{t('purchases.goodsReceipts.lineQuantityReceived')}</TableHead>
                    <TableHead className="text-end">{t('purchases.goodsReceipts.lineUnitCost')}</TableHead>
                    <TableHead className="text-end">{t('documents.lineTotal')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {receipt.lines.map((line, index) => {
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
                            <LotsSummary lots={line.lots ?? []} />
                          </div>
                        </TableCell>
                        <TableCell className="text-end">
                          <QuantityWithUnit quantity={line.quantityReceived} productVariantId={line.productVariantId} unitOfMeasureId={line.unitOfMeasureId} />
                        </TableCell>
                        <TableCell className={AMOUNT_CELL}>
                          <Amount value={line.unitCost.amountMinorUnits} hideCurrency />
                        </TableCell>
                        <TableCell className={`${AMOUNT_CELL} font-semibold`}>
                          <Amount value={lineTotals[index]} hideCurrency />
                        </TableCell>
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
              rows={[
                { label: t('documents.linesCount'), value: receipt.lines.length },
                { label: t('documents.quantityTotal'), value: <span className="tabular-nums">{quantityTotal}</span> },
              ]}
              totalLabel={t('documents.total')}
              totalValue={<Amount value={total.toString()} hideCurrency />}
              currency={currency}
            />
            <DocumentHistory entityType="goods_receipt" entityId={receipt.id} />
          </>
        }
      />
    </div>
  );
}

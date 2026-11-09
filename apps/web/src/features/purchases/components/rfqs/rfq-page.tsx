import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQueries } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { SupplierQuotationWithLinesDto } from '@erp-platform/contracts';
import {
  Badge,
  Button,
  Can,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  EmptyState,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  cn,
  toast,
} from '@erp-platform/ui';
import { Ban, FileQuestion, Pencil, Send, ShoppingCart, Trash2 } from 'lucide-react';

import { apiGet, ApiError } from '../../../../lib/api-client';
import { useSuppliers } from '../../api/suppliers/queries';
import { usePurchaseRequisition } from '../../api/purchase-requisitions/queries';
import { usePurchaseOrders } from '../../api/purchase-orders/queries';
import { useCancelRfq, useDeleteRfq, useRfq, useSendRfq } from '../../api/rfqs/queries';
import {
  useDeleteSupplierQuotation,
  useRejectSupplierQuotation,
  useSelectSupplierQuotation,
  useSupplierQuotation,
  useSupplierQuotations,
} from '../../api/supplier-quotations/queries';
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
  type ChainStep,
} from '../../../../components/document/document-layout';
import { DocumentHistory } from '../../../../components/document/document-history';
import { QuantityWithUnit } from '../../../../components/product/unit-select';
import { useVariantIndex } from '../../../../components/product/use-variant-index';
import { CreateSupplierQuotationForm, EditSupplierQuotationForm } from './quotation-form';
import { QUOTATION_STATUS_VARIANT, quotationStatusLabelKey } from './quotation-status';
import { RFQ_STATUS_VARIANT, RFQS_PATH, rfqStatusLabelKey } from './rfq-status';
import { PURCH, PURCH_WRITE } from '../../../../lib/permissions';

const REQUISITIONS_PATH = '/purchases/purchase-requisitions';
const PURCHASE_ORDERS_PATH = '/purchases/purchase-orders';

/** Unit price per base unit, in minor units (quotations may quote in a bigger unit). */
function perBaseUnit(line: SupplierQuotationWithLinesDto['lines'][number]): number {
  return Number(line.unitPrice.amountMinorUnits) / (line.unitFactor || 1);
}

function quotationTotal(quotation: SupplierQuotationWithLinesDto): string {
  return quotation.lines
    .reduce((sum, line) => sum + BigInt(multiplyMinorUnits(line.unitPrice.amountMinorUnits, line.quantity)), 0n)
    .toString();
}

/** /purchases/rfqs/:id — the RFQ, its suppliers' quotations side by side, and choosing one. */
export function RfqPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { data: rfq, isLoading, isError } = useRfq(id);
  const { data: suppliers } = useSuppliers();
  const { data: requisition } = usePurchaseRequisition(rfq?.sourceRequisitionId);
  const { data: quotations, isLoading: quotationsLoading } = useSupplierQuotations(rfq?.id);
  const { data: orders } = usePurchaseOrders();
  const variantIndex = useVariantIndex();

  // Every quotation's lines, for the comparison table.
  const detailQueries = useQueries({
    queries: (quotations ?? []).map((q) => ({
      queryKey: ['supplier-quotations', q.id],
      queryFn: () => apiGet<SupplierQuotationWithLinesDto>(`/supplier-quotations/${q.id}`),
    })),
  });
  const detailed = detailQueries.map((q) => q.data).filter((q): q is SupplierQuotationWithLinesDto => Boolean(q));

  const send = useSendRfq();
  const cancel = useCancelRfq();
  const remove = useDeleteRfq();
  const selectQuotation = useSelectSupplierQuotation();
  const rejectQuotation = useRejectSupplierQuotation();
  const deleteQuotation = useDeleteSupplierQuotation();
  const busy = send.isPending || cancel.isPending || remove.isPending;

  const [recordOpen, setRecordOpen] = useState(false);
  const [activeQuotationId, setActiveQuotationId] = useState<string | null>(null);
  const { data: activeQuotation, isLoading: activeLoading } = useSupplierQuotation(activeQuotationId);

  const supplierName = useMemo(() => new Map((suppliers ?? []).map((s) => [s.id, s.name])), [suppliers]);
  const selected = (quotations ?? []).find((q) => q.status === 'selected');
  const orderFromSelected = selected ? (orders ?? []).find((o) => o.sourceQuotationId === selected.id) : undefined;

  // Lowest per-base-unit price for each product across non-rejected quotations.
  const bestPrice = useMemo(() => {
    const best = new Map<string, number>();
    for (const q of detailed) {
      if (q.status === 'rejected') continue;
      for (const line of q.lines) {
        const price = perBaseUnit(line);
        const current = best.get(line.productVariantId);
        if (current === undefined || price < current) best.set(line.productVariantId, price);
      }
    }
    return best;
  }, [detailed]);

  if (isLoading) return <Skeleton className="h-64 w-full rounded-xl" />;
  if (isError || !rfq) {
    return (
      <EmptyState
        icon={<FileQuestion />}
        title={t('documents.notFound')}
        action={
          <Button variant="outline" asChild>
            <Link to={RFQS_PATH}>{t('documents.back')}</Link>
          </Button>
        }
      />
    );
  }

  const { status } = rfq;
  const quotedSupplierIds = new Set((quotations ?? []).map((q) => q.supplierId));
  const eligibleSupplierIds = rfq.supplierIds.filter((sid) => !quotedSupplierIds.has(sid));
  const canRecordQuotation = status === 'sent' && eligibleSupplierIds.length > 0;

  async function run(
    action: () => Promise<unknown>,
    successKey: string,
    errorKey: string,
    confirm?: { key: string; danger?: boolean },
  ) {
    if (confirm && !(await confirmDialog(t(confirm.key), confirm.danger ? { tone: 'danger' } : {}))) return false;
    try {
      await action();
      toast.success(t(successKey));
      return true;
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t(errorKey));
      return false;
    }
  }

  const steps: ChainStep[] = [
    ...(rfq.sourceRequisitionId
      ? [
          {
            key: 'requisition',
            label: t('documents.steps.requisition'),
            detail: requisition?.requisitionNumber,
            state: 'done' as const,
            to: `${REQUISITIONS_PATH}/${rfq.sourceRequisitionId}`,
          },
        ]
      : []),
    { key: 'rfq', label: t('documents.steps.rfq'), detail: rfq.rfqNumber, state: status === 'draft' ? 'current' : 'done' },
    {
      key: 'quotations',
      label: t('purchases.rfqs.quotations'),
      detail: quotations ? String(quotations.length) : undefined,
      state: status === 'sent' ? 'current' : status === 'closed' ? 'done' : 'upcoming',
    },
    orderFromSelected
      ? {
          key: 'order',
          label: t('documents.steps.purchaseOrder'),
          detail: orderFromSelected.poNumber,
          state: 'done',
          to: `${PURCHASE_ORDERS_PATH}/${orderFromSelected.id}`,
        }
      : { key: 'order', label: t('documents.steps.purchaseOrder'), state: selected ? 'current' : 'upcoming' },
  ];

  return (
    <div className="flex flex-col">
      <DocumentHeaderBar
        backTo={RFQS_PATH}
        backLabel={t('documents.back')}
        eyebrow={t('purchases.tabs.rfqs')}
        title={<span className="tabular">{rfq.rfqNumber}</span>}
        status={
          <Badge variant={RFQ_STATUS_VARIANT[status]} dot>
            {t(rfqStatusLabelKey(status))}
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
                    onClick={async () => {
                      const ok = await run(() => remove.mutateAsync(rfq.id), 'purchases.rfqs.deleteSuccess', 'common.error', {
                        key: 'purchases.rfqs.deleteConfirm',
                        danger: true,
                      });
                      if (ok) navigate(RFQS_PATH, { replace: true });
                    }}
                  >
                    <Trash2 />
                    {t('common.delete')}
                  </Button>
                </Can>
              ) : null}
              {status === 'draft' || status === 'sent' ? (
                <Can permission={PURCH.cancel}>
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={() =>
                      void run(() => cancel.mutateAsync(rfq.id), 'purchases.rfqs.cancelSuccess', 'purchases.rfqs.cancelError', {
                        key: 'purchases.rfqs.cancelConfirm',
                        danger: true,
                      })
                    }
                  >
                    <Ban />
                    {t('purchases.rfqs.cancel')}
                  </Button>
                </Can>
              ) : null}
              {status === 'draft' ? (
                <>
                  <Can permission={PURCH.create}>
                    <Button variant="outline" asChild>
                      <Link to={`${RFQS_PATH}/${rfq.id}/edit`}>
                        <Pencil />
                        {t('common.edit')}
                      </Link>
                    </Button>
                  </Can>
                  <Can permission={PURCH.create}>
                    <Button
                      disabled={busy}
                      onClick={() => void run(() => send.mutateAsync(rfq.id), 'purchases.rfqs.sendSuccess', 'purchases.rfqs.sendError')}
                    >
                      <Send />
                      {t('purchases.rfqs.send')}
                    </Button>
                  </Can>
                </>
              ) : null}
              {canRecordQuotation ? (
                <Can permission={PURCH.create}>
                  <Button variant={selected ? 'outline' : 'default'} onClick={() => setRecordOpen(true)}>
                    {t('purchases.rfqs.recordQuotation')}
                  </Button>
                </Can>
              ) : null}
              {selected && !orderFromSelected ? (
                <Can permission={PURCH.create}>
                  <Button asChild>
                    <Link to={`${PURCHASE_ORDERS_PATH}/new?quotationId=${selected.id}`}>
                      <ShoppingCart />
                      {t('purchases.rfqs.createOrder')}
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
                  { label: t('documents.date'), value: <span className="tabular">{formatDate(rfq.createdAt)}</span> },
                  {
                    label: t('purchases.rfqs.sourceRequisition'),
                    value: rfq.sourceRequisitionId ? (
                      <Link className="tabular text-primary hover:underline" to={`${REQUISITIONS_PATH}/${rfq.sourceRequisitionId}`}>
                        {requisition?.requisitionNumber ?? '…'}
                      </Link>
                    ) : (
                      t('purchases.rfqs.noSourceRequisition')
                    ),
                  },
                  {
                    label: t('purchases.rfqs.invitedSuppliers'),
                    value: (
                      <span className="flex flex-wrap gap-1.5">
                        {rfq.supplierIds.map((sid) => (
                          <Badge key={sid} variant="secondary">
                            {supplierName.get(sid) ?? '—'}
                          </Badge>
                        ))}
                      </span>
                    ),
                    wide: true,
                  },
                  ...(rfq.notes ? [{ label: t('documents.notes'), value: rfq.notes, wide: true }] : []),
                ]}
              />
            </SectionCard>

            <SectionCard
              title={detailed.length > 0 ? t('purchases.rfqs.comparison') : t('documents.lines')}
              description={detailed.length > 1 ? t('purchases.rfqs.comparisonHint') : undefined}
              flush
            >
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead>{t('purchases.rfqs.lineProduct')}</TableHead>
                      <TableHead className="text-end">{t('documents.quantity')}</TableHead>
                      {detailed.map((q) => (
                        <TableHead key={q.id} className={cn('text-end', q.status === 'rejected' && 'opacity-50')}>
                          {supplierName.get(q.supplierId) ?? '—'}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rfq.lines.map((line) => {
                      const variant = variantIndex.get(line.productVariantId);
                      return (
                        <TableRow key={line.id}>
                          <TableCell>
                            <span className="font-medium">{variant?.productName ?? '—'}</span>
                            <span className="ms-2 text-xs text-muted-foreground">{variant?.sku}</span>
                          </TableCell>
                          <TableCell className="text-end">
                            <QuantityWithUnit quantity={line.quantity} productVariantId={line.productVariantId} unitOfMeasureId={null} />
                          </TableCell>
                          {detailed.map((q) => {
                            const quoted = q.lines.find((l) => l.productVariantId === line.productVariantId);
                            const isBest =
                              quoted !== undefined && q.status !== 'rejected' && bestPrice.get(line.productVariantId) === perBaseUnit(quoted) && detailed.length > 1;
                            return (
                              <TableCell
                                key={q.id}
                                className={cn(AMOUNT_CELL, q.status === 'rejected' && 'opacity-50', isBest && 'font-semibold text-success')}
                              >
                                {quoted ? <Amount value={quoted.unitPrice.amountMinorUnits} hideCurrency /> : <span className="text-muted-foreground">—</span>}
                              </TableCell>
                            );
                          })}
                        </TableRow>
                      );
                    })}
                    {detailed.length > 0 ? (
                      <TableRow className="bg-muted/40 hover:bg-muted/40">
                        <TableCell colSpan={2} className="font-semibold">
                          {t('documents.total')}
                        </TableCell>
                        {detailed.map((q) => (
                          <TableCell key={q.id} className={cn(AMOUNT_CELL, 'font-semibold', q.status === 'rejected' && 'opacity-50')}>
                            <Amount value={quotationTotal(q)} currency={q.lines[0]?.unitPrice.currency} />
                          </TableCell>
                        ))}
                      </TableRow>
                    ) : null}
                  </TableBody>
                </Table>
              </div>
            </SectionCard>

            <SectionCard title={t('purchases.rfqs.quotations')} flush>
              {quotationsLoading ? <Skeleton className="m-5 h-16" /> : null}
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>{t('purchases.rfqs.quotationSupplier')}</TableHead>
                    <TableHead>{t('common.status')}</TableHead>
                    <TableHead>{t('purchases.rfqs.validUntil')}</TableHead>
                    <TableHead className="w-64" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(quotations ?? []).map((quotation) => (
                    <TableRow key={quotation.id}>
                      <TableCell className="font-medium">{supplierName.get(quotation.supplierId) ?? '—'}</TableCell>
                      <TableCell>
                        <Badge variant={QUOTATION_STATUS_VARIANT[quotation.status]} dot>
                          {t(quotationStatusLabelKey(quotation.status))}
                        </Badge>
                      </TableCell>
                      <TableCell className="tabular-nums">{quotation.validUntil ? formatDate(quotation.validUntil) : '—'}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap justify-end gap-1">
                          <Button variant="ghost" size="sm" onClick={() => setActiveQuotationId(quotation.id)}>
                            {quotation.status === 'received' ? t('common.edit') : t('purchases.rfqs.viewDetails')}
                          </Button>
                          {quotation.status === 'received' ? (
                            <Can permission={PURCH.post}>
                              <>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() =>
                                    void run(
                                      () => selectQuotation.mutateAsync(quotation.id),
                                      'purchases.rfqs.selectQuotationSuccess',
                                      'purchases.rfqs.selectQuotationError',
                                      { key: 'purchases.rfqs.selectQuotationConfirm' },
                                    )
                                  }
                                >
                                  {t('purchases.rfqs.select')}
                                </Button>
                                <Can permission={PURCH.post}>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() =>
                                      void run(
                                        () => rejectQuotation.mutateAsync(quotation.id),
                                        'purchases.rfqs.rejectQuotationSuccess',
                                        'purchases.rfqs.rejectQuotationError',
                                        { key: 'purchases.rfqs.rejectQuotationConfirm', danger: true },
                                      )
                                    }
                                  >
                                    {t('purchases.rfqs.reject')}
                                  </Button>
                                </Can>
                                <Can permission={PURCH.cancel}>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="text-danger"
                                    onClick={() =>
                                      void run(
                                        () => deleteQuotation.mutateAsync({ id: quotation.id, rfqId: rfq.id }),
                                        'purchases.rfqs.deleteQuotationSuccess',
                                        'common.error',
                                        { key: 'purchases.rfqs.deleteQuotationConfirm', danger: true },
                                      )
                                    }
                                  >
                                    {t('common.delete')}
                                  </Button>
                                </Can>
                              </>
                            </Can>
                          ) : null}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {!quotationsLoading && (quotations ?? []).length === 0 ? (
                    <TableRow className="hover:bg-transparent">
                      <TableCell colSpan={4} className="h-16 text-center text-muted-foreground">
                        {status === 'draft' ? t('purchases.rfqs.sendFirst') : t('purchases.rfqs.noQuotations')}
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </SectionCard>
          </>
        }
        side={<DocumentHistory entityType="rfq" entityId={rfq.id} />}
      />

      <Dialog open={recordOpen} onOpenChange={setRecordOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{t('purchases.rfqs.recordQuotation')}</DialogTitle>
          </DialogHeader>
          <CreateSupplierQuotationForm rfqId={rfq.id} eligibleSupplierIds={eligibleSupplierIds} onDone={() => setRecordOpen(false)} />
        </DialogContent>
      </Dialog>

      <Dialog open={activeQuotationId !== null} onOpenChange={(open) => !open && setActiveQuotationId(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              {activeQuotation ? supplierName.get(activeQuotation.supplierId) : t('purchases.rfqs.viewDetails')}
            </DialogTitle>
          </DialogHeader>
          {activeLoading ? <Skeleton className="h-40 w-full" /> : null}
          {activeQuotation && activeQuotation.status === 'received' ? (
            <EditSupplierQuotationForm quotation={activeQuotation} onDone={() => setActiveQuotationId(null)} />
          ) : null}
          {activeQuotation && activeQuotation.status !== 'received' ? <QuotationLinesReadOnly quotation={activeQuotation} /> : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** What a selected/rejected quotation quoted (those can no longer be edited). */
function QuotationLinesReadOnly({ quotation }: { quotation: SupplierQuotationWithLinesDto }) {
  const { t } = useTranslation();
  const variantIndex = useVariantIndex();
  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead>{t('purchases.rfqs.lineProduct')}</TableHead>
          <TableHead className="text-end">{t('documents.quantity')}</TableHead>
          <TableHead className="text-end">{t('documents.unitPrice')}</TableHead>
          <TableHead>{t('purchases.rfqs.lineNotes')}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {quotation.lines.map((line) => (
          <TableRow key={line.id}>
            <TableCell>{variantIndex.get(line.productVariantId)?.productName ?? '—'}</TableCell>
            <TableCell className="text-end">
              <QuantityWithUnit quantity={line.quantity} productVariantId={line.productVariantId} unitOfMeasureId={line.unitOfMeasureId} />
            </TableCell>
            <TableCell className={AMOUNT_CELL}>
              <Amount value={line.unitPrice.amountMinorUnits} currency={line.unitPrice.currency} />
            </TableCell>
            <TableCell className="text-muted-foreground">{line.notes ?? '—'}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

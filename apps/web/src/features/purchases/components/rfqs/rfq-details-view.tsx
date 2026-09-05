import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { RfqWithDetailsDto, SupplierQuotationWithLinesDto } from '@erp-platform/contracts';
import {
  Badge,
  Button,
  Can,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  toast,
} from '@erp-platform/ui';

import { usePurchaseRequisitions } from '../../api/purchase-requisitions/queries';
import { useSuppliers } from '../../api/suppliers/queries';
import {
  useDeleteSupplierQuotation,
  useRejectSupplierQuotation,
  useSelectSupplierQuotation,
  useSupplierQuotation,
  useSupplierQuotations,
} from '../../api/supplier-quotations/queries';
import { useVariantIndex } from '../../hooks/rfqs/use-variant-index';
import { ApiError } from '../../../../lib/api-client';
import { formatMoney } from '../../../../lib/money';
import { RFQ_STATUS_VARIANT, rfqStatusLabelKey } from './rfq-status';
import { QUOTATION_STATUS_VARIANT, quotationStatusLabelKey } from './quotation-status';
import { CreateSupplierQuotationForm, EditSupplierQuotationForm } from './quotation-form';

/** Read-only lines table for a quotation that is no longer 'received' (selected/rejected)
 * — those can't go through EditSupplierQuotationForm any more (backend only allows editing
 * a 'received' quotation), so this is the only way left to see what it actually quoted. */
function QuotationLinesReadOnly({ quotation }: { quotation: SupplierQuotationWithLinesDto }) {
  const { t } = useTranslation();
  const variantIndex = useVariantIndex();
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t('purchases.rfqs.lineProduct')}</TableHead>
          <TableHead>{t('purchases.rfqs.lineQuantity')}</TableHead>
          <TableHead>{t('purchases.rfqs.unitPrice')}</TableHead>
          <TableHead>{t('purchases.rfqs.lineNotes')}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {quotation.lines.map((line) => (
          <TableRow key={line.id}>
            <TableCell>
              {variantIndex.get(line.productVariantId)?.productName ?? '—'} (
              {variantIndex.get(line.productVariantId)?.sku ?? '—'})
            </TableCell>
            <TableCell>{line.quantity}</TableCell>
            <TableCell>{formatMoney(line.unitPrice.amountMinorUnits, line.unitPrice.currency)}</TableCell>
            <TableCell>{line.notes ?? '—'}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function RfqDetailsView({ rfq }: { rfq: RfqWithDetailsDto }) {
  const { t } = useTranslation();
  const { data: requisitions } = usePurchaseRequisitions();
  const { data: suppliers } = useSuppliers();
  const { data: quotations, isLoading: quotationsLoading } = useSupplierQuotations(rfq.id);
  const variantIndex = useVariantIndex();

  const selectQuotation = useSelectSupplierQuotation();
  const rejectQuotation = useRejectSupplierQuotation();
  const deleteQuotation = useDeleteSupplierQuotation();

  const [recordOpen, setRecordOpen] = useState(false);
  const [activeQuotationId, setActiveQuotationId] = useState<string | null>(null);
  const { data: activeQuotation, isLoading: activeQuotationLoading } = useSupplierQuotation(activeQuotationId);

  const requisitionById = useMemo(() => new Map((requisitions ?? []).map((r) => [r.id, r])), [requisitions]);
  const supplierById = useMemo(() => new Map((suppliers ?? []).map((s) => [s.id, s])), [suppliers]);

  const quotedSupplierIds = useMemo(
    () => new Set((quotations ?? []).map((q) => q.supplierId)),
    [quotations],
  );
  const eligibleSupplierIds = useMemo(
    () => rfq.supplierIds.filter((id) => !quotedSupplierIds.has(id)),
    [rfq.supplierIds, quotedSupplierIds],
  );
  const canRecordQuotation = rfq.status === 'sent' && eligibleSupplierIds.length > 0;

  async function handleSelect(id: string) {
    if (!window.confirm(t('purchases.rfqs.selectQuotationConfirm'))) return;
    try {
      await selectQuotation.mutateAsync(id);
      toast.success(t('purchases.rfqs.selectQuotationSuccess'));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('purchases.rfqs.selectQuotationError'));
    }
  }

  async function handleReject(id: string) {
    if (!window.confirm(t('purchases.rfqs.rejectQuotationConfirm'))) return;
    try {
      await rejectQuotation.mutateAsync(id);
      toast.success(t('purchases.rfqs.rejectQuotationSuccess'));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('purchases.rfqs.rejectQuotationError'));
    }
  }

  async function handleDeleteQuotation(id: string) {
    if (!window.confirm(t('purchases.rfqs.deleteQuotationConfirm'))) return;
    try {
      await deleteQuotation.mutateAsync({ id, rfqId: rfq.id });
      toast.success(t('purchases.rfqs.deleteQuotationSuccess'));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('common.error'));
    }
  }

  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <div>
          <p className="text-muted-foreground">{t('purchases.rfqs.rfqNumber')}</p>
          <p className="font-medium">{rfq.rfqNumber}</p>
        </div>
        <div>
          <p className="text-muted-foreground">{t('common.status')}</p>
          <Badge variant={RFQ_STATUS_VARIANT[rfq.status]}>{t(rfqStatusLabelKey(rfq.status))}</Badge>
        </div>
        <div>
          <p className="text-muted-foreground">{t('purchases.rfqs.sourceRequisition')}</p>
          <p className="font-medium">
            {rfq.sourceRequisitionId
              ? requisitionById.get(rfq.sourceRequisitionId)?.requisitionNumber ?? '—'
              : t('purchases.rfqs.noSourceRequisition')}
          </p>
        </div>
        <div className="col-span-2 sm:col-span-1">
          <p className="text-muted-foreground">{t('purchases.rfqs.notes')}</p>
          <p className="font-medium">{rfq.notes ?? '—'}</p>
        </div>
      </div>

      <div>
        <p className="mb-2 text-sm font-medium text-muted-foreground">{t('purchases.rfqs.lines')}</p>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('purchases.rfqs.lineProduct')}</TableHead>
              <TableHead>{t('purchases.rfqs.lineQuantity')}</TableHead>
              <TableHead>{t('purchases.rfqs.lineNotes')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rfq.lines.map((line) => (
              <TableRow key={line.id}>
                <TableCell>
                  {variantIndex.get(line.productVariantId)?.productName ?? '—'} (
                  {variantIndex.get(line.productVariantId)?.sku ?? '—'})
                </TableCell>
                <TableCell>{line.quantity}</TableCell>
                <TableCell>{line.notes ?? '—'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div>
        <p className="mb-2 text-sm font-medium text-muted-foreground">{t('purchases.rfqs.invitedSuppliers')}</p>
        <div className="flex flex-wrap gap-1.5">
          {rfq.supplierIds.map((id) => (
            <Badge key={id} variant="secondary">
              {supplierById.get(id)?.name ?? '—'}
            </Badge>
          ))}
        </div>
      </div>

      <div className="grid gap-2">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-muted-foreground">{t('purchases.rfqs.quotations')}</p>
          <Can permission="purchases.manage">
            {canRecordQuotation ? (
              <Button size="sm" variant="outline" onClick={() => setRecordOpen(true)}>
                {t('purchases.rfqs.recordQuotation')}
              </Button>
            ) : null}
          </Can>
        </div>

        {quotationsLoading ? <Skeleton className="h-24 w-full" /> : null}

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('purchases.rfqs.quotationSupplier')}</TableHead>
              <TableHead>{t('common.status')}</TableHead>
              <TableHead>{t('purchases.rfqs.validUntil')}</TableHead>
              <TableHead className="w-56" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {(quotations ?? []).map((quotation) => (
              <TableRow key={quotation.id}>
                <TableCell>{supplierById.get(quotation.supplierId)?.name ?? '—'}</TableCell>
                <TableCell>
                  <Badge variant={QUOTATION_STATUS_VARIANT[quotation.status]}>
                    {t(quotationStatusLabelKey(quotation.status))}
                  </Badge>
                </TableCell>
                <TableCell>{quotation.validUntil ?? '—'}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap justify-end gap-1">
                    <Button variant="ghost" size="sm" onClick={() => setActiveQuotationId(quotation.id)}>
                      {quotation.status === 'received' ? t('common.edit') : t('purchases.rfqs.viewDetails')}
                    </Button>
                    <Can permission="purchases.manage">
                      <>
                        {quotation.status === 'received' ? (
                          <Button variant="ghost" size="sm" onClick={() => handleSelect(quotation.id)}>
                            {t('purchases.rfqs.select')}
                          </Button>
                        ) : null}
                        {quotation.status === 'received' ? (
                          <Button variant="ghost" size="sm" onClick={() => handleReject(quotation.id)}>
                            {t('purchases.rfqs.reject')}
                          </Button>
                        ) : null}
                        {quotation.status === 'received' ? (
                          <Button variant="ghost" size="sm" onClick={() => handleDeleteQuotation(quotation.id)}>
                            {t('common.delete')}
                          </Button>
                        ) : null}
                      </>
                    </Can>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {(quotations ?? []).length === 0 && !quotationsLoading ? (
              <TableRow>
                <TableCell colSpan={4} className="py-6 text-center text-muted-foreground">
                  {t('common.noResults')}
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>

      <Dialog open={recordOpen} onOpenChange={setRecordOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t('purchases.rfqs.recordQuotation')}</DialogTitle>
          </DialogHeader>
          <CreateSupplierQuotationForm
            rfqId={rfq.id}
            eligibleSupplierIds={eligibleSupplierIds}
            onDone={() => setRecordOpen(false)}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={activeQuotationId !== null} onOpenChange={(open) => !open && setActiveQuotationId(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {activeQuotation?.status === 'received' ? t('common.edit') : t('purchases.rfqs.viewDetails')}
            </DialogTitle>
          </DialogHeader>
          {activeQuotationLoading ? <Skeleton className="h-40 w-full" /> : null}
          {activeQuotation && activeQuotation.status === 'received' ? (
            <EditSupplierQuotationForm
              quotation={activeQuotation}
              onDone={() => setActiveQuotationId(null)}
            />
          ) : null}
          {activeQuotation && activeQuotation.status !== 'received' ? (
            <QuotationLinesReadOnly quotation={activeQuotation} />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Button,
  EmptyState,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@erp-platform/ui';
import { FileQuestion } from 'lucide-react';

import { useSupplier } from '../../api/suppliers/queries';
import { usePurchaseDebitNote } from '../../api/purchase-debit-notes/queries';
import { formatDate } from '../../../../lib/format-date';
import { Amount, AMOUNT_CELL } from '../../../../components/amount';
import { DocumentBody, DocumentHeaderBar, InfoGrid, SectionCard, TotalsPanel } from '../../../../components/document/document-layout';
import { QuantityWithUnit } from '../../../../components/product/unit-select';
import { useVariantIndex } from '../../../../components/product/use-variant-index';
import { PrintButton } from '../../../../components/printing/print-button';
import { taxTotalsRowsFromDto } from '../../../../components/taxes/tax-totals';
import { DEBIT_NOTES_PATH } from './debit-notes-page';

const PURCHASE_RETURNS_PATH = '/purchases/purchase-returns';
const SUPPLIERS_PATH = '/purchases/suppliers';

/** /purchases/debit-notes/:id — read-only; it prints with its purchase return. */
export function DebitNotePage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const { data: note, isLoading, isError } = usePurchaseDebitNote(id);
  const { data: supplier } = useSupplier(note?.supplierId);
  const variantIndex = useVariantIndex();

  if (isLoading) return <Skeleton className="h-64 w-full rounded-xl" />;
  if (isError || !note) {
    return (
      <EmptyState
        icon={<FileQuestion />}
        title={t('documents.notFound')}
        action={
          <Button variant="outline" asChild>
            <Link to={DEBIT_NOTES_PATH}>{t('documents.back')}</Link>
          </Button>
        }
      />
    );
  }

  return (
    <div className="flex flex-col">
      <DocumentHeaderBar
        backTo={DEBIT_NOTES_PATH}
        backLabel={t('documents.back')}
        eyebrow={t('purchases.debitNotes.title')}
        title={<span className="tabular">{note.debitNoteNumber}</span>}
        actions={<PrintButton documentType="purchase_return" id={note.purchaseReturnId} />}
      />
      <DocumentBody
        main={
          <>
            <SectionCard title={t('documents.info')}>
              <InfoGrid
                items={[
                  {
                    label: t('purchases.purchaseOrders.supplier'),
                    value: supplier ? (
                      <Link className="text-primary hover:underline" to={`${SUPPLIERS_PATH}/${supplier.id}`}>
                        {supplier.name}
                      </Link>
                    ) : undefined,
                  },
                  { label: t('documents.date'), value: <span className="tabular">{formatDate(note.debitNoteDate)}</span> },
                  {
                    label: t('purchases.debitNotes.purchaseReturn'),
                    value: (
                      <Link className="tabular text-primary hover:underline" to={`${PURCHASE_RETURNS_PATH}/${note.purchaseReturnId}`}>
                        {note.returnNumber}
                      </Link>
                    ),
                  },
                ]}
              />
              <p className="mt-4 text-xs text-muted-foreground">{t('purchases.debitNotes.explain')}</p>
            </SectionCard>

            <SectionCard title={t('documents.lines')} flush>
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-10 text-center">#</TableHead>
                    <TableHead>{t('purchases.purchaseOrders.lineProduct')}</TableHead>
                    <TableHead className="text-end">{t('documents.quantity')}</TableHead>
                    <TableHead className="text-end">{t('purchases.debitNotes.netAmount')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {note.lines.map((line, index) => {
                    const variant = variantIndex.get(line.productVariantId);
                    return (
                      <TableRow key={line.id}>
                        <TableCell className="text-center text-muted-foreground">{index + 1}</TableCell>
                        <TableCell>
                          <span className="font-medium">{variant?.productName ?? '—'}</span>
                          <span className="ms-2 text-xs text-muted-foreground">{variant?.sku}</span>
                        </TableCell>
                        <TableCell className="text-end">
                          <QuantityWithUnit quantity={line.baseQuantity} productVariantId={line.productVariantId} unitOfMeasureId={null} />
                        </TableCell>
                        <TableCell className={AMOUNT_CELL}>
                          <Amount value={line.netAmount.amountMinorUnits} hideCurrency />
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
          <TotalsPanel
            title={t('documents.summary')}
            rows={taxTotalsRowsFromDto(t, note)}
            totalLabel={t('documents.total')}
            totalValue={<Amount value={note.totalAmount.amountMinorUnits} hideCurrency />}
            currency={note.currency}
          />
        }
      />
    </div>
  );
}

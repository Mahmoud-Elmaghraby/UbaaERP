import { useMemo } from 'react';
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
import { FileQuestion, Info } from 'lucide-react';

import { useCustomer } from '../../api/customers/queries';
import { useSalesReturn } from '../../api/sales-returns/queries';
import { useSalesCreditNote } from '../../api/sales-credit-notes/queries';
import { useVariantIndex } from '../../../../components/product/use-variant-index';
import { formatDate } from '../../../../lib/format-date';
import { Amount, AMOUNT_CELL } from '../../../../components/amount';
import {
  DocumentBody,
  DocumentHeaderBar,
  InfoGrid,
  SectionCard,
  TotalsPanel,
} from '../../../../components/document/document-layout';
import { DocumentHistory } from '../../../../components/document/document-history';
import { LineTaxesNote } from '../../../../components/taxes/line-taxes-note';
import { taxTotalsRowsFromDto } from '../../../../components/taxes/tax-totals';
import { QuantityWithUnit } from '../../../../components/product/unit-select';
import { PrintButton } from '../../../../components/printing/print-button';
import { SALES_CREDIT_NOTES_PATH } from './sales-credit-notes-page';

/**
 * /sales/sales-credit-notes/:id — read-only: a credit note is issued by
 * confirming a sales return and has no lifecycle, so the only action is print.
 */
export function SalesCreditNoteDetailsPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const { data: creditNote, isLoading, isError } = useSalesCreditNote(id);
  const { data: customer } = useCustomer(creditNote?.customerId);
  const { data: salesReturn } = useSalesReturn(creditNote?.salesReturnId);
  const variantIndex = useVariantIndex();

  const quantityTotal = useMemo(
    () => (creditNote?.lines ?? []).reduce((sum, line) => sum + line.quantity, 0),
    [creditNote],
  );

  if (isLoading) {
    return (
      <div className="flex flex-col gap-5">
        <Skeleton className="h-14 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (isError || !creditNote) {
    return (
      <EmptyState
        icon={<FileQuestion />}
        title={t('documents.notFound')}
        action={
          <Button variant="outline" asChild>
            <Link to={SALES_CREDIT_NOTES_PATH}>{t('documents.back')}</Link>
          </Button>
        }
      />
    );
  }

  const currency = creditNote.totalAmount.currency;

  return (
    <div className="flex flex-col">
      <DocumentHeaderBar
        backTo={SALES_CREDIT_NOTES_PATH}
        backLabel={t('documents.back')}
        eyebrow={t('sales.tabs.salesCreditNotes')}
        title={<span className="tabular">{creditNote.creditNoteNumber}</span>}
        actions={<PrintButton documentType="sales_credit_note" id={creditNote.id} />}
      />

      <DocumentBody
        main={
          <>
            <div className="flex items-start gap-2.5 rounded-xl border border-info/20 bg-info-soft px-4 py-3 text-[13px] text-info">
              <Info className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{t('sales.salesCreditNotes.autoNote')}</span>
            </div>

            <SectionCard title={t('documents.info')}>
              <InfoGrid
                items={[
                  {
                    label: t('sales.salesCreditNotes.customer'),
                    value: customer ? (
                      <Link className="text-primary hover:underline" to={`/sales/customers/${customer.id}/statement`}>
                        {customer.name}
                      </Link>
                    ) : (
                      '—'
                    ),
                  },
                  {
                    label: t('sales.salesCreditNotes.salesReturn'),
                    value: salesReturn ? (
                      <Link
                        className="tabular text-primary hover:underline"
                        to={`/sales/sales-returns/${salesReturn.id}`}
                      >
                        {salesReturn.returnNumber}
                      </Link>
                    ) : (
                      '—'
                    ),
                  },
                  {
                    label: t('sales.salesCreditNotes.createdAt'),
                    value: <span className="tabular">{formatDate(creditNote.createdAt)}</span>,
                  },
                  ...(creditNote.notes ? [{ label: t('documents.notes'), value: creditNote.notes, wide: true }] : []),
                ]}
              />
            </SectionCard>

            <SectionCard
              title={t('documents.lines')}
              description={`${t('documents.linesCount')}: ${creditNote.lines.length}`}
              flush
            >
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-10 text-center">#</TableHead>
                    <TableHead>{t('sales.salesCreditNotes.lineProduct')}</TableHead>
                    <TableHead className="text-end">{t('documents.quantity')}</TableHead>
                    <TableHead className="text-end">{t('documents.unitPrice')}</TableHead>
                    <TableHead className="text-end">{t('documents.lineTotal')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {creditNote.lines.map((line, index) => {
                    const variant = variantIndex.get(line.productVariantId);
                    return (
                      <TableRow key={line.id}>
                        <TableCell className="text-center text-muted-foreground">{index + 1}</TableCell>
                        <TableCell>
                          <div className="flex flex-col leading-snug">
                            <span className="font-medium">{variant?.productName ?? '—'}</span>
                            <span className="text-xs text-muted-foreground">{variant?.sku}</span>
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
                          <Amount value={line.netAmount.amountMinorUnits} hideCurrency />
                          <LineTaxesNote taxes={line.taxes} />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {creditNote.lines.length === 0 ? (
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
                { label: t('documents.linesCount'), value: creditNote.lines.length },
                { label: t('documents.quantityTotal'), value: quantityTotal },
                ...taxTotalsRowsFromDto(t, creditNote),
              ]}
              totalLabel={t('documents.total')}
              totalValue={<Amount value={creditNote.totalAmount.amountMinorUnits} hideCurrency />}
              currency={currency}
            />
            <DocumentHistory entityType="sales_credit_note" entityId={creditNote.id} />
          </>
        }
      />
    </div>
  );
}

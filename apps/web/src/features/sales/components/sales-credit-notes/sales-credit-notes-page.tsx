import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { ColumnDef } from '@tanstack/react-table';
import type { SalesCreditNoteDto } from '@erp-platform/contracts';
import { DataTable, PageHeader } from '@erp-platform/ui';

import { useCustomers } from '../../api/customers/queries';
import { useSalesReturns } from '../../api/sales-returns/queries';
import { useSalesCreditNoteDetails, useSalesCreditNotes } from '../../api/sales-credit-notes/queries';
import { Amount, AMOUNT_CELL } from '../../../../components/amount';
import { formatDate } from '../../../../lib/format-date';

export const SALES_CREDIT_NOTES_PATH = '/sales/sales-credit-notes';

interface CreditNoteRow extends SalesCreditNoteDto {
  customerName: string;
  returnNumber: string;
  /** Minor units; undefined while that note's totals are still loading. */
  totalMinorUnits: string | undefined;
}

/**
 * إشعارات الدائن — read-only: every credit note is issued by confirming a sales
 * return, so there is no "new" button and no status. A row opens its page.
 */
export function SalesCreditNotesPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: creditNotes, isLoading } = useSalesCreditNotes();
  const { data: customers } = useCustomers();
  const { data: salesReturns } = useSalesReturns();
  const ids = useMemo(() => (creditNotes ?? []).map((note) => note.id), [creditNotes]);
  const details = useSalesCreditNoteDetails(ids);

  const totalsKey = details.map((q) => q.data?.totalAmount.amountMinorUnits ?? '').join('|');
  const rows = useMemo<CreditNoteRow[]>(() => {
    const customerById = new Map((customers ?? []).map((c) => [c.id, c.name]));
    const returnById = new Map((salesReturns ?? []).map((r) => [r.id, r.returnNumber]));
    const totalById = new Map(
      details.flatMap((q) => (q.data ? [[q.data.id, q.data.totalAmount.amountMinorUnits] as const] : [])),
    );
    return (creditNotes ?? []).map((note) => ({
      ...note,
      customerName: customerById.get(note.customerId) ?? '—',
      returnNumber: returnById.get(note.salesReturnId) ?? '—',
      totalMinorUnits: totalById.get(note.id),
    }));
    // `details` is a new array every render; totalsKey tracks its content.
  }, [creditNotes, customers, salesReturns, totalsKey]);

  const columns = useMemo<ColumnDef<CreditNoteRow>[]>(
    () => [
      {
        accessorKey: 'creditNoteNumber',
        header: t('sales.salesCreditNotes.creditNoteNumber'),
        cell: ({ row }) => <span className="font-medium tabular-nums">{row.original.creditNoteNumber}</span>,
      },
      {
        id: 'createdAt',
        header: t('sales.salesCreditNotes.createdAt'),
        accessorFn: (row) => String(row.createdAt),
        cell: ({ row }) => <span className="tabular-nums">{formatDate(row.original.createdAt)}</span>,
      },
      { accessorKey: 'customerName', header: t('sales.salesCreditNotes.customer') },
      {
        accessorKey: 'returnNumber',
        header: t('sales.salesCreditNotes.salesReturn'),
        cell: ({ row }) => <span className="tabular-nums">{row.original.returnNumber}</span>,
      },
      {
        id: 'total',
        header: () => <div className="text-end">{t('sales.salesCreditNotes.totalAmount')}</div>,
        accessorFn: (row) => row.totalMinorUnits ?? '',
        cell: ({ row }) => (
          <div className={AMOUNT_CELL}>
            <Amount value={row.original.totalMinorUnits} currency={row.original.currency} />
          </div>
        ),
      },
    ],
    [t],
  );

  return (
    <div className="grid gap-5">
      <PageHeader title={t('sales.tabs.salesCreditNotes')} description={t('sales.salesCreditNotes.subtitle')} />
      <DataTable
        columns={columns}
        data={rows}
        isLoading={isLoading}
        searchable
        searchPlaceholder={t('sales.salesCreditNotes.search')}
        onRowClick={(note) => navigate(`${SALES_CREDIT_NOTES_PATH}/${note.id}`)}
      />
    </div>
  );
}

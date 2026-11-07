import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { ColumnDef } from '@tanstack/react-table';
import type { PurchaseDebitNoteDto } from '@erp-platform/contracts';
import { DataTable, PageHeader } from '@erp-platform/ui';

import { useSuppliers } from '../../api/suppliers/queries';
import { usePurchaseDebitNotes } from '../../api/purchase-debit-notes/queries';
import { Amount, AMOUNT_CELL } from '../../../../components/amount';
import { formatDate } from '../../../../lib/format-date';

export const DEBIT_NOTES_PATH = '/purchases/debit-notes';

type Row = PurchaseDebitNoteDto & { supplierName: string };

/** إشعارات الخصم — issued automatically when a return of invoiced goods is confirmed. */
export function DebitNotesPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: notes, isLoading } = usePurchaseDebitNotes();
  const { data: suppliers } = useSuppliers();

  const rows = useMemo<Row[]>(() => {
    const supplierName = new Map((suppliers ?? []).map((s) => [s.id, s.name]));
    return (notes ?? []).map((note) => ({ ...note, supplierName: supplierName.get(note.supplierId) ?? '—' }));
  }, [notes, suppliers]);

  const columns = useMemo<ColumnDef<Row>[]>(
    () => [
      {
        accessorKey: 'debitNoteNumber',
        header: t('purchases.debitNotes.number'),
        cell: ({ row }) => <span className="font-medium tabular-nums">{row.original.debitNoteNumber}</span>,
      },
      {
        id: 'date',
        header: t('documents.date'),
        accessorFn: (row) => formatDate(row.debitNoteDate),
        cell: ({ getValue }) => <span className="tabular-nums">{String(getValue())}</span>,
      },
      { accessorKey: 'supplierName', header: t('purchases.purchaseOrders.supplier') },
      {
        accessorKey: 'returnNumber',
        header: t('purchases.debitNotes.purchaseReturn'),
        cell: ({ row }) => <span className="tabular-nums">{row.original.returnNumber}</span>,
      },
      {
        id: 'total',
        header: () => <div className="text-end">{t('documents.total')}</div>,
        accessorFn: (row) => row.totalAmount.amountMinorUnits,
        cell: ({ row }) => (
          <div className={AMOUNT_CELL}>
            <Amount value={row.original.totalAmount.amountMinorUnits} currency={row.original.totalAmount.currency} />
          </div>
        ),
      },
    ],
    [t],
  );

  return (
    <div className="grid gap-5">
      <PageHeader title={t('purchases.debitNotes.title')} description={t('purchases.debitNotes.subtitle')} />
      <DataTable
        columns={columns}
        data={rows}
        isLoading={isLoading}
        searchable
        searchPlaceholder={t('purchases.debitNotes.search')}
        onRowClick={(row) => navigate(`${DEBIT_NOTES_PATH}/${row.id}`)}
      />
    </div>
  );
}

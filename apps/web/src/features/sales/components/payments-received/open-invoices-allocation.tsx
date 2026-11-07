import type { SalesInvoiceRegisterRowDto } from '@erp-platform/contracts';

import type { OpenInvoiceRow } from '../../../../components/document/open-invoices-allocation';

/** Sales invoice register rows in the shared allocation table's shape. */
export function toOpenInvoiceRows(rows: readonly SalesInvoiceRegisterRowDto[]): OpenInvoiceRow[] {
  return rows.map((row) => ({
    id: row.id,
    number: row.invoiceNumber,
    invoiceDate: row.invoiceDate,
    dueDate: row.dueDate,
    overdueDays: row.overdueDays,
    totalMinorUnits: row.totalMinorUnits,
    outstandingMinorUnits: row.outstandingMinorUnits,
    href: `/sales/sales-invoices/${row.id}`,
  }));
}

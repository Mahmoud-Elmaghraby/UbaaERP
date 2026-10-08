import type { TFunction } from 'i18next';

import { formatAmount } from '../../lib/money';
import type { TotalsRow } from '../document/document-layout';

interface Totals {
  net: string;
  table: string;
  vat: string;
  withholding: string;
}

/**
 * Rows for TotalsPanel: net, then each tax that is not zero. The panel's
 * own total line shows net + table + VAT − withholding.
 */
export function taxTotalsRows(t: TFunction, totals: Totals): TotalsRow[] {
  const rows: TotalsRow[] = [
    { label: t('taxes.totals.net'), value: formatAmount(totals.net) },
  ];
  if (totals.table !== '0') rows.push({ label: t('taxes.totals.table'), value: formatAmount(totals.table) });
  if (totals.vat !== '0') rows.push({ label: t('taxes.totals.vat'), value: formatAmount(totals.vat) });
  if (totals.withholding !== '0') {
    rows.push({ label: t('taxes.totals.withholding'), value: `(${formatAmount(totals.withholding)})`, tone: 'danger' });
  }
  return rows;
}

/** Same rows from a document DTO's Money totals. */
export function taxTotalsRowsFromDto(
  t: TFunction,
  dto: {
    netAmount: { amountMinorUnits: string };
    tableTaxAmount: { amountMinorUnits: string };
    vatAmount: { amountMinorUnits: string };
    withholdingAmount: { amountMinorUnits: string };
  },
) {
  return taxTotalsRows(t, {
    net: dto.netAmount.amountMinorUnits,
    table: dto.tableTaxAmount.amountMinorUnits,
    vat: dto.vatAmount.amountMinorUnits,
    withholding: dto.withholdingAmount.amountMinorUnits,
  });
}

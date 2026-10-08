import type { PrintLineDto } from '@erp-platform/contracts';

import { formatAmount } from '../../../lib/money';

export const amount = (money: { amountMinorUnits: string } | null | undefined): string =>
  money ? formatAmount(money.amountMinorUnits) : '';

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const [year, month, day] = iso.slice(0, 10).split('-');
  return `${day}/${month}/${year}`;
}

export function formatQuantity(quantity: number | null | undefined): string {
  if (quantity === null || quantity === undefined) return '';
  return Number.isInteger(quantity) ? String(quantity) : quantity.toFixed(3).replace(/0+$/, '');
}

/** "ق.م 14%" style short tax label for narrow columns. */
export function shortTaxes(line: PrintLineDto): string {
  return (line.taxes ?? [])
    .map((tax) => `${tax.kind === 'withholding' ? '-' : ''}${Number(tax.rate)}%`)
    .join(' | ');
}

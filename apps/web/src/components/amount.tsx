import { cn } from '@erp-platform/ui';

import { formatAmount } from '../lib/money';

/**
 * THE way a money amount is shown in tables and totals: tabular digits,
 * isolated left-to-right (so "-1,250.00" never flips in RTL), negatives in
 * parentheses as accountants write them, zero as a muted dash when asked.
 * The currency is a small muted suffix — or left out entirely when the
 * column header already names it (`hideCurrency`).
 */
export function Amount({
  value,
  currency,
  hideCurrency = false,
  zeroAsDash = false,
  className,
}: {
  /** Minor units as an integer string (the MoneyDto shape). */
  value: string | null | undefined;
  currency?: string;
  hideCurrency?: boolean;
  zeroAsDash?: boolean;
  className?: string;
}) {
  if (value === null || value === undefined || value === '') {
    return <span className={cn('text-muted-foreground', className)}>—</span>;
  }
  const negative = value.startsWith('-');
  const isZero = /^-?0+$/.test(value);
  if (isZero && zeroAsDash) return <span className={cn('text-muted-foreground', className)}>—</span>;
  const body = formatAmount(negative ? value.slice(1) : value);
  return (
    <span dir="ltr" className={cn('inline-block whitespace-nowrap tabular-nums', negative && 'text-destructive', className)}>
      {negative ? `(${body})` : body}
      {!hideCurrency && currency ? <span className="ms-1 text-[0.8em] text-muted-foreground">{currency}</span> : null}
    </span>
  );
}

/** Table-cell alignment for amount columns: numbers line up on the end edge. */
export const AMOUNT_CELL = 'text-end tabular-nums';

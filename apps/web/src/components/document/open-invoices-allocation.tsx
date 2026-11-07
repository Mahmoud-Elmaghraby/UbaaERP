import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Badge,
  Button,
  Input,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  cn,
} from '@erp-platform/ui';
import { Wand2 } from 'lucide-react';

import { Amount, AMOUNT_CELL } from '../amount';
import { formatDate } from '../../lib/format-date';
import { decimalToMinorUnits, minorUnitsToDecimalString } from '../../lib/money';

/** One open invoice (sales or purchase) that a payment can be allocated to. */
export interface OpenInvoiceRow {
  id: string;
  number: string;
  invoiceDate: string | null;
  dueDate: string | null;
  /** Days past due; 0 or omitted = not overdue. */
  overdueDays?: number;
  totalMinorUnits: string;
  outstandingMinorUnits: string;
  /** The invoice's own page. */
  href: string;
}

/** invoiceId → decimal text typed by the user. */
export type AllocationDrafts = Record<string, string>;

/** A typed amount in minor units; null when empty, NaN-ish text or not positive. */
export function parseAllocation(text: string | undefined): bigint | null {
  if (!text || text.trim() === '') return null;
  try {
    const minor = BigInt(decimalToMinorUnits(text));
    return minor > 0n ? minor : null;
  } catch {
    return null;
  }
}

/** Sum of the valid amounts typed. */
export function allocationsTotal(drafts: AllocationDrafts): bigint {
  return Object.values(drafts).reduce((sum, text) => sum + (parseAllocation(text) ?? 0n), 0n);
}

/** Oldest first: by due date, then invoice date, then number. */
function byAge(a: OpenInvoiceRow, b: OpenInvoiceRow): number {
  const ad = a.dueDate ?? a.invoiceDate ?? '';
  const bd = b.dueDate ?? b.invoiceDate ?? '';
  if (ad !== bd) return ad < bd ? -1 : 1;
  return a.number.localeCompare(b.number);
}

/** Fills the invoices oldest-first with up to `available`, each capped at its outstanding. */
export function autoAllocate(invoices: OpenInvoiceRow[], available: bigint): AllocationDrafts {
  const result: AllocationDrafts = {};
  let left = available;
  for (const invoice of [...invoices].sort(byAge)) {
    if (left <= 0n) break;
    const outstanding = BigInt(invoice.outstandingMinorUnits);
    const amount = outstanding < left ? outstanding : left;
    if (amount <= 0n) continue;
    result[invoice.id] = minorUnitsToDecimalString(amount.toString());
    left -= amount;
  }
  return result;
}

/**
 * The party's open invoices with an "allocate" input on each, an auto-distribute button and
 * the live remainder. Shared by customer receipts (sales) and supplier payments (purchases):
 * the new-payment page and a posted payment's "allocate the rest".
 */
export function OpenInvoicesAllocation({
  invoices,
  isLoading,
  currency,
  drafts,
  onChange,
  available,
  emptyText,
}: {
  invoices: OpenInvoiceRow[];
  isLoading?: boolean;
  currency: string;
  drafts: AllocationDrafts;
  onChange: (drafts: AllocationDrafts) => void;
  /** What can be allocated (payment amount or unallocated remainder), minor units; null when unknown. */
  available: bigint | null;
  emptyText: string;
}) {
  const { t } = useTranslation();
  const sorted = [...invoices].sort(byAge);
  const allocated = allocationsTotal(drafts);
  const remainder = available === null ? null : available - allocated;

  if (isLoading) return <Skeleton className="mx-5 mb-5 h-24" />;
  if (sorted.length === 0) return <p className="px-5 pb-5 text-sm text-muted-foreground">{emptyText}</p>;

  return (
    <div className="flex flex-col">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>{t('documents.allocation.invoiceNumber')}</TableHead>
            <TableHead>{t('documents.allocation.invoiceDate')}</TableHead>
            <TableHead>{t('documents.allocation.dueDate')}</TableHead>
            <TableHead className={AMOUNT_CELL}>{t('documents.allocation.total')}</TableHead>
            <TableHead className={AMOUNT_CELL}>{t('documents.allocation.outstanding')}</TableHead>
            <TableHead className="w-40 text-end">{t('documents.allocation.amount')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((invoice) => {
            const text = drafts[invoice.id] ?? '';
            const value = parseAllocation(text);
            const invalid = text.trim() !== '' && (value === null || value > BigInt(invoice.outstandingMinorUnits));
            return (
              <TableRow key={invoice.id}>
                <TableCell>
                  <Link to={invoice.href} className="font-medium tabular-nums text-primary hover:underline">
                    {invoice.number}
                  </Link>
                </TableCell>
                <TableCell className="tabular-nums">{formatDate(invoice.invoiceDate)}</TableCell>
                <TableCell>
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="tabular-nums">{formatDate(invoice.dueDate)}</span>
                    {invoice.overdueDays && invoice.overdueDays > 0 ? (
                      <Badge variant="danger">{t('documents.allocation.overdueDays', { days: invoice.overdueDays })}</Badge>
                    ) : null}
                  </span>
                </TableCell>
                <TableCell className={AMOUNT_CELL}>
                  <Amount value={invoice.totalMinorUnits} hideCurrency />
                </TableCell>
                <TableCell className={AMOUNT_CELL}>
                  <Amount value={invoice.outstandingMinorUnits} hideCurrency />
                </TableCell>
                <TableCell>
                  <Input
                    inputMode="decimal"
                    dir="ltr"
                    placeholder="0.00"
                    aria-label={t('documents.allocation.amount')}
                    aria-invalid={invalid || undefined}
                    className={cn('h-9 text-end tabular-nums', invalid && 'border-destructive')}
                    value={text}
                    onChange={(event) => onChange({ ...drafts, [invoice.id]: event.target.value })}
                  />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t px-5 py-3 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={available === null || available <= 0n}
            onClick={() => onChange(autoAllocate(sorted, available ?? 0n))}
          >
            <Wand2 />
            {t('documents.allocation.auto')}
          </Button>
          {allocated > 0n ? (
            <Button type="button" variant="ghost" size="sm" onClick={() => onChange({})}>
              {t('documents.allocation.clear')}
            </Button>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
          <span className="text-muted-foreground">
            {t('documents.allocation.allocatedTotal')}:{' '}
            <Amount value={allocated.toString()} currency={currency} className="font-medium text-foreground" />
          </span>
          {remainder !== null ? (
            <span className={cn('text-muted-foreground', remainder < 0n && 'text-destructive')}>
              {t('documents.allocation.unallocated')}:{' '}
              <Amount value={remainder.toString()} currency={currency} className="font-semibold" />
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/**
 * The allocations to send, or null when any typed amount is invalid, exceeds its invoice's
 * outstanding, or the total exceeds `available`. Callers map `invoiceId` to their DTO's field.
 */
export function prepareAllocations(
  drafts: AllocationDrafts,
  invoices: OpenInvoiceRow[],
  currency: string,
  available: bigint,
): Array<{ invoiceId: string; allocatedAmount: { amountMinorUnits: string; currency: string } }> | null {
  const result: Array<{ invoiceId: string; allocatedAmount: { amountMinorUnits: string; currency: string } }> = [];
  let total = 0n;
  for (const invoice of invoices) {
    const text = drafts[invoice.id];
    if (!text || text.trim() === '') continue;
    const value = parseAllocation(text);
    if (value === null || value > BigInt(invoice.outstandingMinorUnits)) return null;
    total += value;
    result.push({ invoiceId: invoice.id, allocatedAmount: { amountMinorUnits: value.toString(), currency } });
  }
  return total > available ? null : result;
}

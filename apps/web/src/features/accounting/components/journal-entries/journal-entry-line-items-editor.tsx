import { useMemo, useRef } from 'react';
import type { CreateJournalEntryLineDto } from '@erp-platform/contracts';
import { useTranslation } from 'react-i18next';
import { Plus, Scale, Trash2 } from 'lucide-react';
import {
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
  cn,
} from '@erp-platform/ui';

import { AccountPicker } from '../account-picker';
import { Amount, AMOUNT_CELL } from '../../../../components/amount';
import { useActiveCostCenters } from '../../hooks/use-active-cost-centers';
import { decimalToMinorUnits, minorUnitsToDecimalString } from '../../../../lib/money';

export interface JournalEntryLineDraft {
  /** Local React key only — never sent to the backend. */
  key: string;
  accountId: string | undefined;
  /** Decimal text; a line is a debit OR a credit, never both. */
  debit: string;
  credit: string;
  description: string;
  /** Optional cost-center tag; undefined = none. */
  costCenterId: string | undefined;
}

let nextKey = 0;
export function createEmptyLine(description = ''): JournalEntryLineDraft {
  nextKey += 1;
  return { key: `new-${nextKey}`, accountId: undefined, debit: '', credit: '', description, costCenterId: undefined };
}

function minor(text: string): bigint {
  try {
    return text.trim() === '' ? 0n : BigInt(decimalToMinorUnits(text.trim()));
  } catch {
    return 0n;
  }
}

/** Σ debit, Σ credit of the draft lines (invalid amounts count as 0). */
export function lineTotals(lines: JournalEntryLineDraft[]): { debit: bigint; credit: bigint } {
  let debit = 0n;
  let credit = 0n;
  for (const line of lines) {
    debit += minor(line.debit);
    credit += minor(line.credit);
  }
  return { debit, credit };
}

/** Draft lines → API lines, or the reason they can't be saved. Empty rows are ignored. */
export function prepareLines(lines: JournalEntryLineDraft[], t: (key: string) => string): {
  lines: CreateJournalEntryLineDto[] | null;
  error: string | null;
} {
  const prepared: CreateJournalEntryLineDto[] = [];
  let totalDebit = 0n;
  let totalCredit = 0n;
  for (const line of lines) {
    const debitRaw = line.debit.trim();
    const creditRaw = line.credit.trim();
    if (!line.accountId && debitRaw === '' && creditRaw === '') continue; // an untouched row
    const hasDebit = debitRaw !== '' && Number(debitRaw) > 0;
    const hasCredit = creditRaw !== '' && Number(creditRaw) > 0;
    if (!line.accountId || hasDebit === hasCredit) return { lines: null, error: t('accounting.journalEntries.linesError') };
    let debitMinorUnits: string;
    let creditMinorUnits: string;
    try {
      debitMinorUnits = hasDebit ? decimalToMinorUnits(debitRaw) : '0';
      creditMinorUnits = hasCredit ? decimalToMinorUnits(creditRaw) : '0';
    } catch {
      return { lines: null, error: t('accounting.journalEntries.linesError') };
    }
    totalDebit += BigInt(debitMinorUnits);
    totalCredit += BigInt(creditMinorUnits);
    prepared.push({
      accountId: line.accountId,
      debitAmountMinorUnits: debitMinorUnits,
      creditAmountMinorUnits: creditMinorUnits,
      description: line.description.trim() === '' ? undefined : line.description,
      costCenterId: line.costCenterId ?? undefined,
    });
  }
  if (prepared.length < 2) return { lines: null, error: t('accounting.journalEntries.linesMinError') };
  if (totalDebit !== totalCredit) return { lines: null, error: t('accounting.journalEntries.linesUnbalancedError') };
  return { lines: prepared, error: null };
}


/** API lines → editable drafts (recurring templates and other saved line sets). */
export function draftsFromLines(lines: CreateJournalEntryLineDto[]): JournalEntryLineDraft[] {
  return lines.map((line) => ({
    ...createEmptyLine(line.description ?? ''),
    accountId: line.accountId,
    debit: line.debitAmountMinorUnits === '0' ? '' : minorUnitsToDecimalString(line.debitAmountMinorUnits),
    credit: line.creditAmountMinorUnits === '0' ? '' : minorUnitsToDecimalString(line.creditAmountMinorUnits),
    costCenterId: line.costCenterId ?? undefined,
  }));
}

const NO_COST_CENTER = '__none__';

/**
 * Journal lines as a fast grid: searchable account cell (type a code, Enter),
 * typing a debit clears the credit and vice versa, Enter in the last line's
 * amount adds a line (copying its description), "balance" fills the
 * difference, and a sticky footer shows totals and the difference.
 */
export function JournalEntryLineItemsEditor({
  lines,
  onChange,
  currency,
}: {
  lines: JournalEntryLineDraft[];
  onChange: (lines: JournalEntryLineDraft[]) => void;
  currency: string;
}) {
  const { t } = useTranslation();
  const activeCostCenters = useActiveCostCenters();
  const tableRef = useRef<HTMLTableElement>(null);
  const totals = useMemo(() => lineTotals(lines), [lines]);
  const difference = totals.debit - totals.credit;

  function updateLine(key: string, patch: Partial<JournalEntryLineDraft>) {
    onChange(lines.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  }

  function addLine(afterKey?: string) {
    const source = afterKey ? lines.find((line) => line.key === afterKey) : lines[lines.length - 1];
    const next = createEmptyLine(source?.description ?? '');
    onChange([...lines, next]);
    // Focus the new line's account cell once it renders.
    requestAnimationFrame(() => {
      const triggers = tableRef.current?.querySelectorAll<HTMLButtonElement>('[data-account-cell] button');
      triggers?.[triggers.length - 1]?.focus();
    });
  }

  /** Puts the amount that balances the entry on this line (on the side that is short). */
  function balanceLine(key: string) {
    const line = lines.find((l) => l.key === key);
    if (!line) return;
    const others = lineTotals(lines.filter((l) => l.key !== key));
    const gap = others.debit - others.credit;
    if (gap === 0n) return;
    updateLine(
      key,
      gap > 0n
        ? { debit: '', credit: minorUnitsToDecimalString(gap.toString()) }
        : { debit: minorUnitsToDecimalString((-gap).toString()), credit: '' },
    );
  }

  function onAmountKeyDown(event: React.KeyboardEvent<HTMLInputElement>, key: string) {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    if (lines[lines.length - 1]?.key === key) addLine(key);
  }

  return (
    <div className="overflow-x-auto">
      <Table ref={tableRef} className="min-w-[860px]">
        <TableHeader>
          <TableRow>
            <TableHead className="w-8 text-center">#</TableHead>
            <TableHead className="w-[30%]">{t('accounting.journalEntries.lineAccount')}</TableHead>
            <TableHead className={cn(AMOUNT_CELL, 'w-36')}>{t('accounting.journalEntries.lineDebit')}</TableHead>
            <TableHead className={cn(AMOUNT_CELL, 'w-36')}>{t('accounting.journalEntries.lineCredit')}</TableHead>
            <TableHead>{t('accounting.journalEntries.lineDescription')}</TableHead>
            {activeCostCenters.length > 0 ? (
              <TableHead className="w-44">{t('accounting.journalEntries.lineCostCenter')}</TableHead>
            ) : null}
            <TableHead className="w-20" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {lines.map((line, index) => (
            <TableRow key={line.key} className="align-top">
              <TableCell className="pt-4 text-center text-xs tabular-nums text-muted-foreground">{index + 1}</TableCell>
              <TableCell data-account-cell>
                <AccountPicker
                  className="h-9 w-full"
                  value={line.accountId}
                  onChange={(accountId) => updateLine(line.key, { accountId })}
                />
              </TableCell>
              <TableCell>
                <Input
                  className="h-9 text-end tabular-nums"
                  dir="ltr"
                  inputMode="decimal"
                  placeholder="0.00"
                  aria-label={t('accounting.journalEntries.lineDebit')}
                  value={line.debit}
                  onChange={(e) => updateLine(line.key, { debit: e.target.value, ...(e.target.value ? { credit: '' } : {}) })}
                  onKeyDown={(e) => onAmountKeyDown(e, line.key)}
                />
              </TableCell>
              <TableCell>
                <Input
                  className="h-9 text-end tabular-nums"
                  dir="ltr"
                  inputMode="decimal"
                  placeholder="0.00"
                  aria-label={t('accounting.journalEntries.lineCredit')}
                  value={line.credit}
                  onChange={(e) => updateLine(line.key, { credit: e.target.value, ...(e.target.value ? { debit: '' } : {}) })}
                  onKeyDown={(e) => onAmountKeyDown(e, line.key)}
                />
              </TableCell>
              <TableCell>
                <Input
                  className="h-9"
                  aria-label={t('accounting.journalEntries.lineDescription')}
                  value={line.description}
                  onChange={(e) => updateLine(line.key, { description: e.target.value })}
                />
              </TableCell>
              {activeCostCenters.length > 0 ? (
                <TableCell>
                  <Select
                    value={line.costCenterId ?? NO_COST_CENTER}
                    onValueChange={(value) =>
                      updateLine(line.key, { costCenterId: value === NO_COST_CENTER ? undefined : value })
                    }
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NO_COST_CENTER}>{t('accounting.journalEntries.noCostCenter')}</SelectItem>
                      {activeCostCenters.map((center) => (
                        <SelectItem key={center.id} value={center.id}>
                          {center.code} — {center.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>
              ) : null}
              <TableCell>
                <div className="flex justify-end gap-0.5">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    title={t('accounting.journalEntries.balanceLine')}
                    aria-label={t('accounting.journalEntries.balanceLine')}
                    disabled={difference === 0n}
                    onClick={() => balanceLine(line.key)}
                  >
                    <Scale className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t('common.delete')}
                    disabled={lines.length <= 2}
                    onClick={() => onChange(lines.filter((l) => l.key !== line.key))}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
        <TableFooter>
          <TableRow className="hover:bg-transparent">
            <TableCell />
            <TableCell>
              <Button type="button" variant="outline" size="sm" onClick={() => addLine()}>
                <Plus className="me-1 h-4 w-4" />
                {t('accounting.journalEntries.addLine')}
              </Button>
            </TableCell>
            <TableCell className={cn(AMOUNT_CELL, 'font-semibold')}>
              <Amount value={totals.debit.toString()} hideCurrency />
            </TableCell>
            <TableCell className={cn(AMOUNT_CELL, 'font-semibold')}>
              <Amount value={totals.credit.toString()} hideCurrency />
            </TableCell>
            <TableCell colSpan={activeCostCenters.length > 0 ? 3 : 2}>
              {difference === 0n ? (
                totals.debit > 0n ? (
                  <span className="text-sm font-medium text-success">{t('accounting.journalEntries.balanced')}</span>
                ) : null
              ) : (
                <span className="text-sm font-medium text-destructive">
                  {t('accounting.journalEntries.difference')}{' '}
                  <Amount value={(difference < 0n ? -difference : difference).toString()} currency={currency} />
                </span>
              )}
            </TableCell>
          </TableRow>
        </TableFooter>
      </Table>
    </div>
  );
}

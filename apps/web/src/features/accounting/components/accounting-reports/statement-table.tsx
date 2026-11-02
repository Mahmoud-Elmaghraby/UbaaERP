import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, cn } from '@erp-platform/ui';

import { Amount, AMOUNT_CELL } from '../../../../components/amount';

export interface StatementLine {
  key: string;
  label: ReactNode;
  code?: string;
  /** Minor units per column (current, then comparison). */
  values: (string | undefined)[];
  level?: 'account' | 'subtotal' | 'total';
  onOpen?: () => void;
}

/** Account rows → % change (comparison only). */
function change(current: string | undefined, previous: string | undefined): string | null {
  if (current === undefined || previous === undefined) return null;
  const a = BigInt(current);
  const b = BigInt(previous);
  if (b === 0n) return null;
  const pct = Number(((a - b) * 1000n) / (b < 0n ? -b : b)) / 10;
  return `${pct > 0 ? '+' : ''}${pct.toFixed(1)}%`;
}

/**
 * A financial statement as one table: account lines, subtotals and totals,
 * one amount column per period (current [+ comparison] with % change).
 * Account lines open their ledger.
 */
export function StatementTable({
  columns,
  lines,
}: {
  /** Column headings, e.g. ["نوفمبر 2026", "أكتوبر 2026"]. */
  columns: string[];
  lines: StatementLine[];
}) {
  const { t } = useTranslation();
  const comparing = columns.length > 1;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t('accounting.chartOfAccounts.name')}</TableHead>
          {columns.map((column) => (
            <TableHead key={column} className={cn(AMOUNT_CELL, 'w-40')}>
              {column}
            </TableHead>
          ))}
          {comparing ? <TableHead className={cn(AMOUNT_CELL, 'w-24')}>{t('reports.change')}</TableHead> : null}
        </TableRow>
      </TableHeader>
      <TableBody>
        {lines.map((line) => {
          const level = line.level ?? 'account';
          return (
            <TableRow
              key={line.key}
              onClick={line.onOpen}
              className={cn(
                level === 'subtotal' && 'bg-muted/30 font-semibold hover:bg-muted/30',
                level === 'total' && 'bg-muted/60 text-[15px] font-bold hover:bg-muted/60',
                line.onOpen && 'cursor-pointer print:cursor-auto',
              )}
            >
              <TableCell className={cn(level === 'account' && 'ps-8')}>
                {line.code ? <span className="me-3 tabular-nums text-muted-foreground">{line.code}</span> : null}
                {line.label}
              </TableCell>
              {columns.map((column, index) => (
                <TableCell key={column} className={AMOUNT_CELL}>
                  {line.values.length === 0 ? null : (
                    <Amount value={line.values[index]} hideCurrency zeroAsDash={level === 'account'} />
                  )}
                </TableCell>
              ))}
              {comparing ? (
                <TableCell className={cn(AMOUNT_CELL, 'text-xs text-muted-foreground')} dir="ltr">
                  {line.values.length === 0 ? null : (change(line.values[0], line.values[1]) ?? '—')}
                </TableCell>
              ) : null}
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

/** Joins the account rows of each period into lines (accounts missing in a period show —). */
export function mergeAccountRows(
  periods: ({ accountId: string; accountCode: string; accountName: string; amount: { amountMinorUnits: string } }[] | undefined)[],
  onOpen?: (accountId: string) => void,
): StatementLine[] {
  const byId = new Map<string, StatementLine>();
  periods.forEach((rows, index) => {
    for (const row of rows ?? []) {
      const line =
        byId.get(row.accountId) ??
        ({
          key: row.accountId,
          code: row.accountCode,
          label: row.accountName,
          values: periods.map(() => '0'),
          onOpen: onOpen ? () => onOpen(row.accountId) : undefined,
        } satisfies StatementLine);
      line.values[index] = row.amount.amountMinorUnits;
      byId.set(row.accountId, line);
    }
  });
  return [...byId.values()].sort((a, b) => (a.code ?? '').localeCompare(b.code ?? ''));
}

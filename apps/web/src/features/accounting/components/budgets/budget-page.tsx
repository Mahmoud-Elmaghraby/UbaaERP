import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { BudgetDto, BudgetVsActualDto } from '@erp-platform/contracts';
import {
  Button,
  Can,
  Input,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
  cn,
  toast,
} from '@erp-platform/ui';
import { Equal, Trash2 } from 'lucide-react';

import { useBudget, useBudgetVsActual, useDeleteBudget, useSaveBudget } from '../../api/accounting-completion/queries';
import { useFiscalYear } from '../../api/fiscal-years/queries';
import { ApiError } from '../../../../lib/api-client';
import { decimalToMinorUnits, minorUnitsToDecimalString } from '../../../../lib/money';
import { confirmDialog } from '../../../../components/feedback/confirm-dialog';
import { formatDate } from '../../../../lib/format-date';
import { Amount, AMOUNT_CELL } from '../../../../components/amount';
import { DocumentHeaderBar, SectionCard } from '../../../../components/document/document-layout';
import { DateField } from '../../../../components/report/report-layout';
import { useBaseCurrency } from '../../../settings/queries';
import { AccountPicker } from '../account-picker';
import { usePostableAccounts } from '../../hooks/use-postable-accounts';

type Grid = Array<{ accountId: string; months: string[] }>;

function toMinor(text: string): bigint {
  try {
    return text.trim() === '' ? 0n : BigInt(decimalToMinorUnits(text.trim()));
  } catch {
    return 0n;
  }
}

function monthLabels(startDate: string | undefined): string[] {
  const start = startDate ? new Date(`${startDate}T00:00:00`) : new Date(new Date().getFullYear(), 0, 1);
  const format = new Intl.DateTimeFormat('ar-EG', { month: 'short' });
  return Array.from({ length: 12 }, (_, i) => format.format(new Date(start.getFullYear(), start.getMonth() + i, 1)));
}

/** /accounting/budgets/:id — the 12-month plan grid and the budget-vs-actual report. */
export function BudgetPage() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading } = useBudget(id);
  if (isLoading || !data) return <Skeleton className="h-96 w-full rounded-xl" />;
  return <BudgetEditor key={data.id} budget={data} />;
}

function BudgetEditor({ budget }: { budget: BudgetDto }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const currency = useBaseCurrency();
  const { data: year } = useFiscalYear(budget.fiscalYearId);
  const save = useSaveBudget();
  const remove = useDeleteBudget();
  const postable = usePostableAccounts();
  const plannable = useMemo(() => postable.filter((a) => a.accountType === 'revenue' || a.accountType === 'expense'), [postable]);
  const accountById = useMemo(() => new Map(postable.map((a) => [a.id, a])), [postable]);
  const [tab, setTab] = useState<'plan' | 'actual'>(budget.lines.length > 0 ? 'actual' : 'plan');
  const [grid, setGrid] = useState<Grid>(() =>
    budget.lines.map((l) => ({ accountId: l.accountId, months: l.months.map((m) => (m === '0' ? '' : minorUnitsToDecimalString(m))) })),
  );
  const [dirty, setDirty] = useState(false);
  const labels = monthLabels(year?.startDate);

  const sortedGrid = useMemo(
    () =>
      grid
        .map((row, index) => ({ row, index, account: accountById.get(row.accountId) }))
        .sort((a, b) => (a.account?.code ?? '').localeCompare(b.account?.code ?? '')),
    [grid, accountById],
  );

  function update(index: number, month: number, value: string) {
    setGrid((g) => g.map((row, i) => (i === index ? { ...row, months: row.months.map((m, j) => (j === month ? value : m)) } : row)));
    setDirty(true);
  }

  /** Spreads the row's yearly total evenly; the rounding rest goes to the last month. */
  function spread(index: number) {
    const total = grid[index]!.months.reduce((s, m) => s + toMinor(m), 0n);
    const fromFirst = toMinor(grid[index]!.months[0] ?? '');
    const annual = total === fromFirst ? fromFirst * 12n : total; // only January filled = a monthly figure
    const each = annual / 12n;
    const months = Array.from({ length: 12 }, (_, i) => (i === 11 ? annual - each * 11n : each)).map((m) => (m === 0n ? '' : minorUnitsToDecimalString(m.toString())));
    setGrid((g) => g.map((row, i) => (i === index ? { ...row, months } : row)));
    setDirty(true);
  }

  function addAccount(accountId: string) {
    if (grid.some((r) => r.accountId === accountId)) return;
    setGrid((g) => [...g, { accountId, months: Array.from({ length: 12 }, () => '') }]);
    setDirty(true);
  }

  async function submit() {
    try {
      await save.mutateAsync({
        id: budget.id,
        input: {
          name: budget.name,
          fiscalYearId: budget.fiscalYearId,
          notes: budget.notes,
          lines: grid.map((row) => ({ accountId: row.accountId, months: row.months.map((m) => toMinor(m).toString()) })),
        },
      });
      setDirty(false);
      toast.success(t('accounting.budgets.saved'));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('common.error'));
    }
  }

  async function onDelete() {
    if (!(await confirmDialog(t('accounting.budgets.deleteConfirm', { name: budget.name }), { tone: 'danger' }))) return;
    await remove.mutateAsync(budget.id);
    navigate('/accounting/budgets');
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        void submit();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  const columnTotals = Array.from({ length: 12 }, (_, m) => grid.reduce((s, row) => s + toMinor(row.months[m] ?? ''), 0n));

  return (
    <div>
      <DocumentHeaderBar
        backTo="/accounting/budgets"
        backLabel={t('accounting.tabs.budgets')}
        eyebrow={year?.name ?? t('accounting.tabs.budgets')}
        title={budget.name}
        actions={
          <>
            <div className="flex gap-1 rounded-lg bg-muted p-1">
              {(['plan', 'actual'] as const).map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setTab(key)}
                  className={cn(
                    'rounded-md px-3 py-1 text-sm font-medium transition-colors',
                    tab === key ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {t(`accounting.budgets.tabs.${key}`)}
                </button>
              ))}
            </div>
            <Can permission="accounting.manage">
              <Button variant="ghost" onClick={onDelete}>
                <Trash2 className="me-1 h-4 w-4" />
                {t('common.delete')}
              </Button>
              {tab === 'plan' ? (
                <Button onClick={submit} disabled={save.isPending || !dirty} title="Ctrl+S">
                  {t('common.save')}
                </Button>
              ) : null}
            </Can>
          </>
        }
      />

      {tab === 'actual' ? (
        <BudgetVsActual budgetId={budget.id} currency={currency} />
      ) : (
        <SectionCard
          title={t('accounting.budgets.planTitle')}
          description={t('accounting.budgets.planHint')}
          actions={<AccountPicker value={null} onChange={addAccount} accounts={plannable} placeholder={t('accounting.budgets.addAccount')} className="w-72" />}
          flush
        >
          <div className="overflow-x-auto">
            <Table className="min-w-[1200px]">
              <TableHeader>
                <TableRow>
                  <TableHead className="sticky start-0 z-10 w-64 bg-card">{t('accounting.budgets.account')}</TableHead>
                  {labels.map((label, i) => (
                    <TableHead key={i} className="text-end">
                      {label}
                    </TableHead>
                  ))}
                  <TableHead className="text-end">{t('accounting.budgets.total')}</TableHead>
                  <TableHead className="w-16" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedGrid.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={15} className="py-10 text-center text-sm text-muted-foreground">
                      {t('accounting.budgets.noLines')}
                    </TableCell>
                  </TableRow>
                ) : (
                  sortedGrid.map(({ row, index, account }) => (
                    <TableRow key={row.accountId}>
                      <TableCell className="sticky start-0 z-10 bg-card">
                        <span className="flex min-w-0 gap-2">
                          <span className="w-12 shrink-0 tabular-nums text-muted-foreground">{account?.code}</span>
                          <span className="truncate">{account?.name ?? '—'}</span>
                        </span>
                      </TableCell>
                      {row.months.map((value, m) => (
                        <TableCell key={m} className="p-1">
                          <Input
                            value={value}
                            inputMode="decimal"
                            dir="ltr"
                            className="h-8 min-w-20 text-end tabular-nums"
                            aria-label={`${account?.name ?? ''} ${labels[m]}`}
                            onChange={(e) => update(index, m, e.target.value)}
                          />
                        </TableCell>
                      ))}
                      <TableCell className={cn(AMOUNT_CELL, 'font-medium')}>
                        <Amount value={row.months.reduce((s, m) => s + toMinor(m), 0n).toString()} hideCurrency zeroAsDash />
                      </TableCell>
                      <TableCell className="p-1">
                        <div className="flex">
                          <Button type="button" variant="ghost" size="icon" className="h-8 w-8" title={t('accounting.budgets.spread')} onClick={() => spread(index)}>
                            <Equal className="h-4 w-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground"
                            title={t('common.delete')}
                            onClick={() => {
                              setGrid((g) => g.filter((_, i) => i !== index));
                              setDirty(true);
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
              {sortedGrid.length > 0 ? (
                <TableFooter>
                  <TableRow>
                    <TableCell className="sticky start-0 z-10 bg-muted font-semibold">{t('accounting.budgets.total')}</TableCell>
                    {columnTotals.map((total, m) => (
                      <TableCell key={m} className={AMOUNT_CELL}>
                        <Amount value={total.toString()} hideCurrency zeroAsDash />
                      </TableCell>
                    ))}
                    <TableCell className={cn(AMOUNT_CELL, 'font-semibold')}>
                      <Amount value={columnTotals.reduce((s, x) => s + x, 0n).toString()} hideCurrency />
                    </TableCell>
                    <TableCell />
                  </TableRow>
                </TableFooter>
              ) : null}
            </Table>
          </div>
        </SectionCard>
      )}
    </div>
  );
}

function pct(variance: bigint, budget: bigint): string {
  if (budget === 0n) return '—';
  return `${(Number((variance * 1000n) / budget) / 10).toFixed(1)}%`;
}

function BudgetVsActual({ budgetId, currency }: { budgetId: string; currency: string }) {
  const { t } = useTranslation();
  const [toDate, setToDate] = useState<string>('');
  const { data, isLoading } = useBudgetVsActual(budgetId, toDate || undefined);

  if (isLoading || !data) return <Skeleton className="h-64 w-full rounded-xl" />;
  const groups: Array<{ type: 'revenue' | 'expense' | 'other'; rows: BudgetVsActualDto['rows'] }> = [
    { type: 'revenue', rows: data.rows.filter((r) => r.accountType === 'revenue') },
    { type: 'expense', rows: data.rows.filter((r) => r.accountType === 'expense') },
    { type: 'other', rows: data.rows.filter((r) => r.accountType !== 'revenue' && r.accountType !== 'expense') },
  ];

  return (
    <SectionCard
      title={t('accounting.budgets.vsActualTitle')}
      description={t('accounting.budgets.vsActualRange', { from: formatDate(data.fromDate), to: formatDate(data.toDate) })}
      actions={<DateField label={t('accounting.budgets.until')} value={toDate || data.toDate} onChange={setToDate} />}
      flush
    >
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('accounting.budgets.account')}</TableHead>
            <TableHead className="text-end">{t('accounting.budgets.budget')}</TableHead>
            <TableHead className="text-end">{t('accounting.budgets.actual')}</TableHead>
            <TableHead className="text-end">{t('accounting.budgets.variance')}</TableHead>
            <TableHead className="text-end">%</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">
                {t('accounting.budgets.noLines')}
              </TableCell>
            </TableRow>
          ) : null}
          {groups
            .filter((g) => g.rows.length > 0)
            .map((group) => {
              const budget = group.rows.reduce((s, r) => s + BigInt(r.budgetMinorUnits), 0n);
              const actual = group.rows.reduce((s, r) => s + BigInt(r.actualMinorUnits), 0n);
              // Over budget is good for revenue, bad for expenses.
              const tone = (variance: bigint) =>
                variance === 0n ? '' : (variance > 0n) === (group.type === 'revenue') ? 'text-success' : 'text-destructive';
              return [
                <TableRow key={`${group.type}-head`} className="bg-muted/50 hover:bg-muted/50">
                  <TableCell colSpan={5} className="py-2 text-[13px] font-semibold text-muted-foreground">
                    {t(`accounting.budgets.groups.${group.type}`)}
                  </TableCell>
                </TableRow>,
                ...group.rows.map((r) => {
                  const variance = BigInt(r.varianceMinorUnits);
                  return (
                    <TableRow key={r.accountId}>
                      <TableCell>
                        <span className="flex gap-2">
                          <span className="w-12 tabular-nums text-muted-foreground">{r.accountCode}</span>
                          {r.accountName}
                        </span>
                      </TableCell>
                      <TableCell className={AMOUNT_CELL}><Amount value={r.budgetMinorUnits} hideCurrency /></TableCell>
                      <TableCell className={AMOUNT_CELL}><Amount value={r.actualMinorUnits} hideCurrency /></TableCell>
                      <TableCell className={cn(AMOUNT_CELL, tone(variance))}>
                        <span dir="ltr">{variance > 0n ? '+' : ''}</span>
                        <Amount value={r.varianceMinorUnits} hideCurrency className="text-inherit" />
                      </TableCell>
                      <TableCell className={cn(AMOUNT_CELL, tone(variance))}><span dir="ltr">{pct(variance, BigInt(r.budgetMinorUnits))}</span></TableCell>
                    </TableRow>
                  );
                }),
                <TableRow key={`${group.type}-total`} className="font-semibold">
                  <TableCell>{t('accounting.budgets.groupTotal', { group: t(`accounting.budgets.groups.${group.type}`) })}</TableCell>
                  <TableCell className={AMOUNT_CELL}><Amount value={budget.toString()} currency={currency} /></TableCell>
                  <TableCell className={AMOUNT_CELL}><Amount value={actual.toString()} currency={currency} /></TableCell>
                  <TableCell className={cn(AMOUNT_CELL, tone(actual - budget))}><Amount value={(actual - budget).toString()} hideCurrency className="text-inherit" /></TableCell>
                  <TableCell className={cn(AMOUNT_CELL, tone(actual - budget))}><span dir="ltr">{pct(actual - budget, budget)}</span></TableCell>
                </TableRow>,
              ];
            })}
        </TableBody>
      </Table>
    </SectionCard>
  );
}

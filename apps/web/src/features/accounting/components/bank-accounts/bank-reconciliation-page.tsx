import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Checkbox,
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
  useHasPermission,
} from '@erp-platform/ui';

import { useBankAccount, useBankAccountRegister, useReconcileLine, useUnreconcileLine } from '../../api/bank-accounts/queries';
import { ApiError } from '../../../../lib/api-client';
import { formatDate } from '../../../../lib/format-date';
import { Amount, AMOUNT_CELL } from '../../../../components/amount';
import { DocumentHeaderBar } from '../../../../components/document/document-layout';
import { BankStatementPanel } from './bank-statement-panel';
import { PeriodPicker, ReportFrame, ReportSection, periodText, useReportParams } from '../../../../components/report/report-layout';

/**
 * تسوية البنك — one bank account's book movements for a period, each ticked
 * once it appears on the bank statement. The summary shows the book
 * balance, what is already matched, and what is still open (the
 * difference to explain against the statement).
 */
export function BankReconciliationPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const params = useReportParams();
  const onlyOpen = params.get('open') === '1';
  const view = params.get('view') === 'statement' ? 'statement' : 'book';
  const { data: account } = useBankAccount(id);
  const { data: register, isLoading } = useBankAccountRegister(id, { fromDate: params.from, toDate: params.to });
  const reconcile = useReconcileLine();
  const unreconcile = useUnreconcileLine();
  const canManage = useHasPermission('accounting.manage');

  const summary = useMemo(() => {
    let matched = 0n;
    let open = 0n;
    let openCount = 0;
    for (const line of register?.lines ?? []) {
      const net = BigInt(line.debitAmount.amountMinorUnits) - BigInt(line.creditAmount.amountMinorUnits);
      if (line.isReconciled) matched += net;
      else {
        open += net;
        openCount += 1;
      }
    }
    return { matched, open, openCount };
  }, [register]);

  async function toggle(lineId: string, isReconciled: boolean) {
    if (!id) return;
    try {
      if (isReconciled) await unreconcile.mutateAsync({ bankAccountId: id, lineId });
      else await reconcile.mutateAsync({ bankAccountId: id, lineId });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('accounting.bankAccounts.reconcileError'));
    }
  }

  const lines = (register?.lines ?? []).filter((line) => !onlyOpen || !line.isReconciled);
  const currency = register?.closingBalance.currency ?? account?.currency ?? '';

  return (
    <div>
      <DocumentHeaderBar
        backTo="/accounting/bank-accounts"
        backLabel={t('accounting.tabs.bankAccounts')}
        eyebrow={t('accounting.bankAccounts.reconciliation')}
        title={account ? `${account.name} — ${account.bankName}` : '…'}
      />
      <ReportFrame
        title={`${t('accounting.bankAccounts.reconciliation')} — ${account?.name ?? ''}`}
        period={periodText(t, params.from, params.to)}
        loading={isLoading}
        filters={
          <>
            <PeriodPicker from={params.from} to={params.to} onChange={(range) => params.set(range)} />
            <div className="mb-1 flex gap-1 rounded-lg bg-muted p-1">
              {(['book', 'statement'] as const).map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => params.set({ view: key === 'statement' ? 'statement' : null })}
                  className={cn(
                    'rounded-md px-3 py-1 text-sm font-medium transition-colors',
                    view === key ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {t(`accounting.bankStatement.views.${key}`)}
                </button>
              ))}
            </div>
            {view === 'book' ? (
              <label className="mb-2 flex items-center gap-2 text-sm">
                <Checkbox checked={onlyOpen} onCheckedChange={(v) => params.set({ open: v === true ? '1' : null })} />
                {t('accounting.bankAccounts.onlyOpen')}
              </label>
            ) : null}
          </>
        }
      >
        {view === 'statement' && id ? (
          <BankStatementPanel bankAccountId={id} from={params.from} to={params.to} currency={currency} />
        ) : register ? (
          <>
            <div className="grid gap-3 sm:grid-cols-4">
              <Stat label={t('accounting.reports.openingBalance')} value={register.openingBalance.amountMinorUnits} currency={currency} />
              <Stat label={t('accounting.bankAccounts.matched')} value={summary.matched.toString()} currency={currency} />
              <Stat
                label={t('accounting.bankAccounts.openItems', { count: summary.openCount })}
                value={summary.open.toString()}
                currency={currency}
                tone={summary.openCount > 0 ? 'warning' : 'success'}
              />
              <Stat label={t('accounting.bankAccounts.bookBalance')} value={register.closingBalance.amountMinorUnits} currency={currency} strong />
            </div>
            <ReportSection>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10" />
                    <TableHead className="w-28">{t('accounting.journalEntries.entryDate')}</TableHead>
                    <TableHead className="w-32">{t('accounting.journalEntries.entryNumber')}</TableHead>
                    <TableHead>{t('accounting.journalEntries.description')}</TableHead>
                    <TableHead className={AMOUNT_CELL}>{t('accounting.bankAccounts.deposit')}</TableHead>
                    <TableHead className={AMOUNT_CELL}>{t('accounting.bankAccounts.withdrawal')}</TableHead>
                    <TableHead className={AMOUNT_CELL}>{t('accounting.reports.runningBalance')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines.map((line) => (
                    <TableRow key={line.id} className={cn(line.isReconciled && 'text-muted-foreground')}>
                      <TableCell>
                        <Checkbox
                          checked={line.isReconciled}
                          disabled={!canManage || reconcile.isPending || unreconcile.isPending}
                          aria-label={t('accounting.bankAccounts.reconciled')}
                          onCheckedChange={() => toggle(line.id, line.isReconciled)}
                        />
                      </TableCell>
                      <TableCell className="tabular-nums">{formatDate(line.entryDate)}</TableCell>
                      <TableCell>
                        <Link to={`/accounting/journal-entries/${line.journalEntryId}`} className="text-primary hover:underline">
                          {line.entryNumber}
                        </Link>
                      </TableCell>
                      <TableCell className="max-w-[26rem] truncate">{line.description ?? '—'}</TableCell>
                      <TableCell className={AMOUNT_CELL}>
                        <Amount value={line.debitAmount.amountMinorUnits} hideCurrency zeroAsDash />
                      </TableCell>
                      <TableCell className={AMOUNT_CELL}>
                        <Amount value={line.creditAmount.amountMinorUnits} hideCurrency zeroAsDash />
                      </TableCell>
                      <TableCell className={AMOUNT_CELL}>
                        <Amount value={line.runningBalance.amountMinorUnits} hideCurrency />
                      </TableCell>
                    </TableRow>
                  ))}
                  {lines.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                        {onlyOpen ? t('accounting.bankAccounts.allMatched') : t('accounting.reports.noActivity')}
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
                <TableFooter>
                  <TableRow className="font-semibold">
                    <TableCell colSpan={6}>{t('accounting.bankAccounts.bookBalance')}</TableCell>
                    <TableCell className={AMOUNT_CELL}>
                      <Amount value={register.closingBalance.amountMinorUnits} currency={currency} />
                    </TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            </ReportSection>
          </>
        ) : isLoading ? null : (
          <Skeleton className="h-40 w-full" />
        )}
      </ReportFrame>
    </div>
  );
}

function Stat({
  label,
  value,
  currency,
  strong,
  tone,
}: {
  label: string;
  value: string;
  currency: string;
  strong?: boolean;
  tone?: 'warning' | 'success';
}) {
  return (
    <div className="rounded-xl border bg-card px-4 py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={cn(
          'mt-1 text-lg font-semibold',
          strong && 'text-xl text-brand-700 dark:text-primary',
          tone === 'warning' && 'text-warning',
        )}
      >
        <Amount value={value} currency={currency} />
      </p>
    </div>
  );
}

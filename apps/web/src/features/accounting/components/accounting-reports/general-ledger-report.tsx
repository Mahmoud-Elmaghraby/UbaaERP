import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@erp-platform/ui';

import { usePostableAccounts } from '../../hooks/use-postable-accounts';
import { useGeneralLedgerReport } from '../../api/accounting-reports/queries';
import { formatMoney } from '../../../../lib/money';

/** دفتر الأستاذ — every posted line touching one account, in date order, with a
 * running balance the backend already signs per the account's own normalBalance
 * (see generalLedgerLineSchema's own comment); this view just renders it as-is. */
export function GeneralLedgerReport() {
  const { t } = useTranslation();
  const postableAccounts = usePostableAccounts();
  const [accountId, setAccountId] = useState<string | undefined>();
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [runParams, setRunParams] = useState<{ accountId: string; fromDate?: string; toDate?: string } | null>(
    null,
  );

  const { data: report, isLoading } = useGeneralLedgerReport({
    accountId: runParams?.accountId,
    fromDate: runParams?.fromDate,
    toDate: runParams?.toDate,
  });

  function handleRun() {
    if (!accountId) return;
    setRunParams({ accountId, fromDate: fromDate || undefined, toDate: toDate || undefined });
  }

  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-4 sm:items-end">
        <div className="grid gap-1.5 sm:col-span-2">
          <label className="text-sm font-medium">{t('accounting.reports.account')}</label>
          <Select value={accountId} onValueChange={setAccountId}>
            <SelectTrigger>
              <SelectValue placeholder={t('accounting.journalEntries.selectAccount')} />
            </SelectTrigger>
            <SelectContent>
              {postableAccounts.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.code} — {a.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <label className="text-sm font-medium">{t('accounting.reports.fromDate')}</label>
<Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
        </div>
        <div className="grid gap-1.5">
          <label className="text-sm font-medium">{t('accounting.reports.toDate')}</label>
<Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
        </div>
      </div>
      <Button className="justify-self-start" onClick={handleRun} disabled={!accountId}>
        {t('accounting.reports.run')}
      </Button>

      {isLoading ? <Skeleton className="h-40 w-full" /> : null}

      {report ? (
        <div className="grid gap-3">
          <p className="text-sm font-medium">
            {report.accountCode} — {report.accountName}
          </p>
          <p className="text-sm text-muted-foreground">
            {t('accounting.reports.openingBalance')}: {formatMoney(report.openingBalance.amountMinorUnits, report.openingBalance.currency)}
          </p>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('accounting.journalEntries.entryDate')}</TableHead>
                <TableHead>{t('accounting.journalEntries.entryNumber')}</TableHead>
                <TableHead>{t('accounting.journalEntries.description')}</TableHead>
                <TableHead>{t('accounting.journalEntries.lineDebit')}</TableHead>
                <TableHead>{t('accounting.journalEntries.lineCredit')}</TableHead>
                <TableHead>{t('accounting.reports.runningBalance')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {report.lines.map((line) => (
                <TableRow key={line.journalEntryId}>
                  <TableCell>{line.entryDate}</TableCell>
                  <TableCell>{line.entryNumber}</TableCell>
                  <TableCell>{line.description ?? '—'}</TableCell>
                  <TableCell>
                    {line.debitAmount.amountMinorUnits !== '0'
                      ? formatMoney(line.debitAmount.amountMinorUnits, line.debitAmount.currency)
                      : '—'}
                  </TableCell>
                  <TableCell>
                    {line.creditAmount.amountMinorUnits !== '0'
                      ? formatMoney(line.creditAmount.amountMinorUnits, line.creditAmount.currency)
                      : '—'}
                  </TableCell>
                  <TableCell>{formatMoney(line.runningBalance.amountMinorUnits, line.runningBalance.currency)}</TableCell>
                </TableRow>
              ))}
              {report.lines.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-6 text-center text-muted-foreground">
                    {t('common.noResults')}
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
          <p className="text-sm font-medium">
            {t('accounting.reports.closingBalance')}: {formatMoney(report.closingBalance.amountMinorUnits, report.closingBalance.currency)}
          </p>
        </div>
      ) : null}
    </div>
  );
}

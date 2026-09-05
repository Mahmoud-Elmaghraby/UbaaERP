import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Badge,
  Button,
  Input,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@erp-platform/ui';

import { useTrialBalanceReport } from '../../api/accounting-reports/queries';
import { formatMoney } from '../../../../lib/money';

/** ميزان المراجعة — every leaf account with posted activity up to asOfDate, plus
 * isBalanced (should always be true if every posted entry balanced, since it's the
 * same invariant summed — see trialBalanceReportSchema's own comment). */
export function TrialBalanceReport() {
  const { t } = useTranslation();
  const [asOfDate, setAsOfDate] = useState('');
  const [runDate, setRunDate] = useState<string | undefined>();
  const { data: report, isLoading } = useTrialBalanceReport(runDate);

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="grid gap-1.5">
          <label className="text-sm font-medium">{t('accounting.reports.asOfDate')}</label>
          <Input type="date" value={asOfDate} onChange={(e) => setAsOfDate(e.target.value)} />
        </div>
        <Button onClick={() => setRunDate(asOfDate || undefined)} disabled={!asOfDate}>
          {t('accounting.reports.run')}
        </Button>
      </div>

      {isLoading ? <Skeleton className="h-40 w-full" /> : null}

      {report ? (
        <div className="grid gap-2">
          <Badge variant={report.isBalanced ? 'default' : 'destructive'} className="justify-self-start">
            {report.isBalanced ? t('accounting.reports.balanced') : t('accounting.reports.unbalanced')}
          </Badge>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('accounting.chartOfAccounts.code')}</TableHead>
                <TableHead>{t('accounting.chartOfAccounts.name')}</TableHead>
                <TableHead>{t('accounting.chartOfAccounts.accountType')}</TableHead>
                <TableHead>{t('accounting.journalEntries.totalDebit')}</TableHead>
                <TableHead>{t('accounting.journalEntries.totalCredit')}</TableHead>
                <TableHead>{t('accounting.reports.balance')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {report.rows.map((row) => (
                <TableRow key={row.accountId}>
                  <TableCell>{row.accountCode}</TableCell>
                  <TableCell>{row.accountName}</TableCell>
                  <TableCell>{t(`accounting.chartOfAccounts.accountTypeValue.${row.accountType}`)}</TableCell>
                  <TableCell>{formatMoney(row.totalDebit.amountMinorUnits, row.totalDebit.currency)}</TableCell>
                  <TableCell>{formatMoney(row.totalCredit.amountMinorUnits, row.totalCredit.currency)}</TableCell>
                  <TableCell>{formatMoney(row.balance.amountMinorUnits, row.balance.currency)}</TableCell>
                </TableRow>
              ))}
              {report.rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-6 text-center text-muted-foreground">
                    {t('common.noResults')}
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell colSpan={3}>{t('accounting.reports.total')}</TableCell>
                <TableCell>{formatMoney(report.totalDebit.amountMinorUnits, report.totalDebit.currency)}</TableCell>
                <TableCell>{formatMoney(report.totalCredit.amountMinorUnits, report.totalCredit.currency)}</TableCell>
                <TableCell />
              </TableRow>
            </TableFooter>
          </Table>
        </div>
      ) : null}
    </div>
  );
}

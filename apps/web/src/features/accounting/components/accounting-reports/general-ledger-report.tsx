import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { EmptyState, Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@erp-platform/ui';
import { BookOpen } from 'lucide-react';

import { useGeneralLedgerReport } from '../../api/accounting-reports/queries';
import { AccountPicker } from '../account-picker';
import { Amount, AMOUNT_CELL } from '../../../../components/amount';
import { PeriodPicker, ReportFrame, ReportSection, periodText, useReportParams } from '../../../../components/report/report-layout';
import { formatDate } from '../../../../lib/format-date';
import { minorUnitsToDecimalString } from '../../../../lib/money';
import { downloadXlsx } from '../../../../lib/xlsx';

/** دفتر الأستاذ — one account's entries in a period, opening and running balance; an entry opens on click. */
export function GeneralLedgerReport() {
  const { t } = useTranslation();
  const params = useReportParams({ preset: 'thisYear' });
  const accountId = params.get('account') ?? undefined;
  const { data: report, isLoading } = useGeneralLedgerReport({ accountId, fromDate: params.from, toDate: params.to });

  function exportXlsx() {
    if (!report) return;
    const n = (minor: string) => Number(minorUnitsToDecimalString(minor));
    downloadXlsx(
      `${t('accounting.reports.generalLedger')} ${report.accountCode} ${params.from} ${params.to}`,
      [
        t('accounting.journalEntries.entryDate'),
        t('accounting.journalEntries.entryNumber'),
        t('accounting.journalEntries.description'),
        t('accounting.journalEntries.debit'),
        t('accounting.journalEntries.credit'),
        t('accounting.reports.runningBalance'),
      ],
      [
        ['', '', t('accounting.reports.openingBalance'), null, null, n(report.openingBalance.amountMinorUnits)],
        ...report.lines.map((line) => [
          line.entryDate,
          line.entryNumber,
          line.description ?? '',
          n(line.debitAmount.amountMinorUnits),
          n(line.creditAmount.amountMinorUnits),
          n(line.runningBalance.amountMinorUnits),
        ]),
      ],
    );
  }

  return (
    <ReportFrame
      title={report ? `${t('accounting.reports.generalLedger')} — ${report.accountCode} ${report.accountName}` : t('accounting.reports.generalLedger')}
      period={periodText(t, params.from, params.to)}
      loading={Boolean(accountId) && isLoading}
      onExport={report ? exportXlsx : undefined}
      filters={
        <>
          <label className="grid gap-1">
            <span className="text-xs font-medium text-muted-foreground">{t('accounting.reports.account')}</span>
            <AccountPicker className="h-9 w-72" value={accountId} onChange={(account) => params.set({ account })} />
          </label>
          <PeriodPicker from={params.from} to={params.to} onChange={(range) => params.set(range)} />
        </>
      }
    >
      {!accountId ? (
        <EmptyState icon={<BookOpen />} title={t('accounting.reports.pickAccount')} description={t('accounting.reports.pickAccountHint')} />
      ) : report ? (
        <ReportSection>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-28">{t('accounting.journalEntries.entryDate')}</TableHead>
                <TableHead className="w-32">{t('accounting.journalEntries.entryNumber')}</TableHead>
                <TableHead>{t('accounting.journalEntries.description')}</TableHead>
                <TableHead className={AMOUNT_CELL}>{t('accounting.journalEntries.debit')}</TableHead>
                <TableHead className={AMOUNT_CELL}>{t('accounting.journalEntries.credit')}</TableHead>
                <TableHead className={AMOUNT_CELL}>{t('accounting.reports.runningBalance')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow className="bg-muted/30">
                <TableCell colSpan={5} className="font-medium">
                  {t('accounting.reports.openingBalance')}
                </TableCell>
                <TableCell className={`${AMOUNT_CELL} font-medium`}>
                  <Amount value={report.openingBalance.amountMinorUnits} hideCurrency />
                </TableCell>
              </TableRow>
              {report.lines.map((line, index) => (
                <TableRow key={`${line.journalEntryId}-${index}`}>
                  <TableCell className="tabular-nums">{formatDate(line.entryDate)}</TableCell>
                  <TableCell>
                    <Link
                      to={`/accounting/journal-entries/${line.journalEntryId}`}
                      className="font-medium text-primary hover:underline print:text-foreground"
                    >
                      {line.entryNumber}
                    </Link>
                  </TableCell>
                  <TableCell className="max-w-[28rem] truncate">{line.description ?? '—'}</TableCell>
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
              {report.lines.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                    {t('accounting.reports.noActivity')}
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
            <TableFooter>
              <TableRow className="font-semibold">
                <TableCell colSpan={5}>{t('accounting.reports.closingBalance')}</TableCell>
                <TableCell className={AMOUNT_CELL}>
                  <Amount value={report.closingBalance.amountMinorUnits} currency={report.closingBalance.currency} />
                </TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </ReportSection>
      ) : null}
    </ReportFrame>
  );
}

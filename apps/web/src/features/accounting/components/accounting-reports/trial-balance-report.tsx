import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Badge, Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@erp-platform/ui';

import { useTrialBalanceReport } from '../../api/accounting-reports/queries';
import { Amount, AMOUNT_CELL } from '../../../../components/amount';
import { DateField, ReportFrame, ReportSection, asOfText, useReportParams } from '../../../../components/report/report-layout';
import { minorUnitsToDecimalString } from '../../../../lib/money';
import { downloadXlsx } from '../../../../lib/xlsx';

/** ميزان المراجعة — every account with posted activity up to a date; a row opens its ledger. */
export function TrialBalanceReport() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const params = useReportParams();
  const { data: report, isLoading } = useTrialBalanceReport(params.asOf);

  function exportXlsx() {
    if (!report) return;
    downloadXlsx(
      `${t('accounting.reports.trialBalance')} ${report.asOfDate}`,
      [
        t('accounting.chartOfAccounts.code'),
        t('accounting.chartOfAccounts.name'),
        t('accounting.journalEntries.totalDebit'),
        t('accounting.journalEntries.totalCredit'),
        t('accounting.reports.debitBalance'),
        t('accounting.reports.creditBalance'),
      ],
      report.rows.map((row) => [
        row.accountCode,
        row.accountName,
        Number(minorUnitsToDecimalString(row.totalDebit.amountMinorUnits)),
        Number(minorUnitsToDecimalString(row.totalCredit.amountMinorUnits)),
        Number(minorUnitsToDecimalString(sideOf(row.balance.amountMinorUnits, 'debit'))),
        Number(minorUnitsToDecimalString(sideOf(row.balance.amountMinorUnits, 'credit'))),
      ]),
    );
  }

  const balanceTotals = (report?.rows ?? []).reduce(
    (acc, row) => {
      const value = BigInt(row.balance.amountMinorUnits);
      return value >= 0n ? { ...acc, debit: acc.debit + value } : { ...acc, credit: acc.credit - value };
    },
    { debit: 0n, credit: 0n },
  );

  const openLedger = (accountId: string) =>
    navigate(
      `/accounting/reports/general-ledger?account=${accountId}&from=${params.asOf.slice(0, 4)}-01-01&to=${params.asOf}`,
    );

  return (
    <ReportFrame
      title={t('accounting.reports.trialBalance')}
      period={asOfText(t, params.asOf)}
      loading={isLoading}
      onExport={report ? exportXlsx : undefined}
      filters={
        <>
          <DateField label={t('accounting.reports.asOfDate')} value={params.asOf} onChange={(asOf) => params.set({ asOf })} />
          {report ? (
            <Badge variant={report.isBalanced ? 'success' : 'danger'} className="mb-1.5">
              {report.isBalanced ? t('accounting.reports.balanced') : t('accounting.reports.unbalanced')}
            </Badge>
          ) : null}
        </>
      }
    >
      {report ? (
        <ReportSection>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-24">{t('accounting.chartOfAccounts.code')}</TableHead>
                <TableHead>{t('accounting.chartOfAccounts.name')}</TableHead>
                <TableHead className={AMOUNT_CELL}>{t('accounting.journalEntries.totalDebit')}</TableHead>
                <TableHead className={AMOUNT_CELL}>{t('accounting.journalEntries.totalCredit')}</TableHead>
                <TableHead className={AMOUNT_CELL}>{t('accounting.reports.debitBalance')}</TableHead>
                <TableHead className={AMOUNT_CELL}>
                  {t('accounting.reports.creditBalance')} <span className="text-xs font-normal">({report.currency})</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {report.rows.map((row) => (
                <TableRow
                  key={row.accountId}
                  className="cursor-pointer print:cursor-auto"
                  onClick={() => openLedger(row.accountId)}
                  title={t('accounting.reports.openLedger')}
                >
                  <TableCell className="tabular-nums text-muted-foreground">{row.accountCode}</TableCell>
                  <TableCell>{row.accountName}</TableCell>
                  <TableCell className={AMOUNT_CELL}>
                    <Amount value={row.totalDebit.amountMinorUnits} hideCurrency zeroAsDash />
                  </TableCell>
                  <TableCell className={AMOUNT_CELL}>
                    <Amount value={row.totalCredit.amountMinorUnits} hideCurrency zeroAsDash />
                  </TableCell>
                  <TableCell className={`${AMOUNT_CELL} font-medium`}>
                    <Amount value={sideOf(row.balance.amountMinorUnits, 'debit')} hideCurrency zeroAsDash />
                  </TableCell>
                  <TableCell className={`${AMOUNT_CELL} font-medium`}>
                    <Amount value={sideOf(row.balance.amountMinorUnits, 'credit')} hideCurrency zeroAsDash />
                  </TableCell>
                </TableRow>
              ))}
              {report.rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                    {t('accounting.reports.noActivity')}
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
            <TableFooter>
              <TableRow className="font-semibold">
                <TableCell colSpan={2}>{t('accounting.reports.total')}</TableCell>
                <TableCell className={AMOUNT_CELL}>
                  <Amount value={report.totalDebit.amountMinorUnits} hideCurrency />
                </TableCell>
                <TableCell className={AMOUNT_CELL}>
                  <Amount value={report.totalCredit.amountMinorUnits} hideCurrency />
                </TableCell>
                <TableCell className={AMOUNT_CELL}>
                  <Amount value={balanceTotals.debit.toString()} hideCurrency />
                </TableCell>
                <TableCell className={AMOUNT_CELL}>
                  <Amount value={balanceTotals.credit.toString()} hideCurrency />
                </TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </ReportSection>
      ) : null}
    </ReportFrame>
  );
}

/** A debit − credit balance split into its debit or credit column ('0' on the other side). */
function sideOf(balance: string, side: 'debit' | 'credit'): string {
  const value = BigInt(balance);
  if (side === 'debit') return value > 0n ? value.toString() : '0';
  return value < 0n ? (-value).toString() : '0';
}

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
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

import { useIncomeStatementReport } from '../../api/accounting-reports/queries';
import { formatMoney } from '../../../../lib/money';

/** قائمة الدخل — revenue and expense accounts over a date range, net of contra
 * accounts (see AccountingReportsService's categoryCanonicalSide() comment for why
 * this is signed by account-type category, not each account's own normalBalance),
 * rolling up to netIncome. */
export function IncomeStatementReport() {
  const { t } = useTranslation();
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  // useIncomeStatementReport's params type requires both keys present (string | undefined),
  // not merely optional — matches its own signature exactly rather than the wider
  // { fromDate?: string; toDate?: string } shape (which fails assignability under
  // exactOptionalPropertyTypes: an absent key and a key set to undefined are distinct types).
  const [runParams, setRunParams] = useState<{ fromDate: string | undefined; toDate: string | undefined }>({
    fromDate: undefined,
    toDate: undefined,
  });
  const { data: report, isLoading } = useIncomeStatementReport(runParams);

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="grid gap-1.5">
          <label className="text-sm font-medium">{t('accounting.reports.fromDate')}</label>
          <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
        </div>
        <div className="grid gap-1.5">
          <label className="text-sm font-medium">{t('accounting.reports.toDate')}</label>
          <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
        </div>
        <Button
          onClick={() => setRunParams({ fromDate: fromDate || undefined, toDate: toDate || undefined })}
          disabled={!fromDate || !toDate}
        >
          {t('accounting.reports.run')}
        </Button>
      </div>

      {isLoading ? <Skeleton className="h-40 w-full" /> : null}

      {report ? (
        <div className="grid gap-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead colSpan={2}>{t('accounting.reports.revenue')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {report.revenueRows.map((row) => (
                <TableRow key={row.accountId}>
                  <TableCell>
                    {row.accountCode} — {row.accountName}
                  </TableCell>
                  <TableCell>{formatMoney(row.amount.amountMinorUnits, row.amount.currency)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell>{t('accounting.reports.totalRevenue')}</TableCell>
                <TableCell>{formatMoney(report.totalRevenue.amountMinorUnits, report.totalRevenue.currency)}</TableCell>
              </TableRow>
            </TableFooter>
          </Table>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead colSpan={2}>{t('accounting.reports.expenses')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {report.expenseRows.map((row) => (
                <TableRow key={row.accountId}>
                  <TableCell>
                    {row.accountCode} — {row.accountName}
                  </TableCell>
                  <TableCell>{formatMoney(row.amount.amountMinorUnits, row.amount.currency)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell>{t('accounting.reports.totalExpenses')}</TableCell>
                <TableCell>{formatMoney(report.totalExpense.amountMinorUnits, report.totalExpense.currency)}</TableCell>
              </TableRow>
            </TableFooter>
          </Table>

          <p className="text-lg font-semibold">
            {t('accounting.reports.netIncome')}: {formatMoney(report.netIncome.amountMinorUnits, report.netIncome.currency)}
          </p>
        </div>
      ) : null}
    </div>
  );
}

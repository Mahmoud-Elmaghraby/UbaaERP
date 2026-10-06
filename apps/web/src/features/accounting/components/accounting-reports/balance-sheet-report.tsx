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

import { useBalanceSheetReport } from '../../api/accounting-reports/queries';
import { formatMoney } from '../../../../lib/money';

/** الميزانية العمومية — asset/liability/equity balances as of a date, plus
 * currentYearEarnings as a memo line (net income from the fiscal year's start up to
 * asOfDate, NOT a posted year-end closing entry — see balanceSheetReportSchema's own
 * comment on why) so isBalanced can be true before real closing entries exist. */
export function BalanceSheetReport() {
  const { t } = useTranslation();
  const [asOfDate, setAsOfDate] = useState('');
  const [runDate, setRunDate] = useState<string | undefined>();
  const { data: report, isLoading } = useBalanceSheetReport(runDate);

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
        <div className="grid gap-6">
          <Badge variant={report.isBalanced ? 'success' : 'danger'} className="justify-self-start">
            {report.isBalanced
              ? t('accounting.reports.balanced')
              : t('accounting.reports.unbalanced')}
          </Badge>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead colSpan={2}>{t('accounting.reports.assets')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {report.assetRows.map((row) => (
                <TableRow key={row.accountId}>
                  <TableCell>
                    {row.accountCode} — {row.accountName}
                  </TableCell>
                  <TableCell>
                    {formatMoney(row.amount.amountMinorUnits, row.amount.currency)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell>{t('accounting.reports.totalAssets')}</TableCell>
                <TableCell>
                  {formatMoney(report.totalAssets.amountMinorUnits, report.totalAssets.currency)}
                </TableCell>
              </TableRow>
            </TableFooter>
          </Table>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead colSpan={2}>{t('accounting.reports.liabilities')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {report.liabilityRows.map((row) => (
                <TableRow key={row.accountId}>
                  <TableCell>
                    {row.accountCode} — {row.accountName}
                  </TableCell>
                  <TableCell>
                    {formatMoney(row.amount.amountMinorUnits, row.amount.currency)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell>{t('accounting.reports.totalLiabilities')}</TableCell>
                <TableCell>
                  {formatMoney(
                    report.totalLiabilities.amountMinorUnits,
                    report.totalLiabilities.currency,
                  )}
                </TableCell>
              </TableRow>
            </TableFooter>
          </Table>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead colSpan={2}>{t('accounting.reports.equity')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {report.equityRows.map((row) => (
                <TableRow key={row.accountId}>
                  <TableCell>
                    {row.accountCode} — {row.accountName}
                  </TableCell>
                  <TableCell>
                    {formatMoney(row.amount.amountMinorUnits, row.amount.currency)}
                  </TableCell>
                </TableRow>
              ))}
              <TableRow>
                <TableCell>{t('accounting.reports.currentYearEarnings')}</TableCell>
                <TableCell>
                  {formatMoney(
                    report.currentYearEarnings.amountMinorUnits,
                    report.currentYearEarnings.currency,
                  )}
                </TableCell>
              </TableRow>
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell>{t('accounting.reports.totalEquity')}</TableCell>
                <TableCell>
                  {formatMoney(report.totalEquity.amountMinorUnits, report.totalEquity.currency)}
                </TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </div>
      ) : null}
    </div>
  );
}

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

import { useCashFlowReport } from '../../api/accounting-reports/queries';
import { formatMoney } from '../../../../lib/money';

/**
 * قائمة التدفقات النقدية — indirect method, "operating activities" only
 * (see AccountingReportsService.cashFlowStatement()'s own comment for why
 * this platform doesn't yet build a full three-section statement: there's
 * no operating/investing/financing classification on chart_of_accounts,
 * and adding one is a real new domain concept, not a quick report).
 * Same date-range shape as IncomeStatementReport.
 */
export function CashFlowReport() {
  const { t } = useTranslation();
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [runParams, setRunParams] = useState<{ fromDate: string | undefined; toDate: string | undefined }>({
    fromDate: undefined,
    toDate: undefined,
  });
  const { data: report, isLoading } = useCashFlowReport(runParams);

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
          <p className="text-sm text-muted-foreground">{t('accounting.reports.cashFlowNote')}</p>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead colSpan={2}>{t('accounting.reports.operatingAdjustments')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell>{t('accounting.reports.netIncome')}</TableCell>
                <TableCell>{formatMoney(report.netIncome.amountMinorUnits, report.netIncome.currency)}</TableCell>
              </TableRow>
              {report.adjustments.map((row) => (
                <TableRow key={row.accountId}>
                  <TableCell>
                    {row.accountCode} — {row.accountName}
                  </TableCell>
                  <TableCell>
                    {formatMoney(row.changeAmount.amountMinorUnits, row.changeAmount.currency)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell>{t('accounting.reports.netCashFromOperations')}</TableCell>
                <TableCell>
                  {formatMoney(
                    report.netCashFromOperations.amountMinorUnits,
                    report.netCashFromOperations.currency,
                  )}
                </TableCell>
              </TableRow>
            </TableFooter>
          </Table>

          <Table>
            <TableBody>
              <TableRow>
                <TableCell>{t('accounting.reports.openingCash')}</TableCell>
                <TableCell>{formatMoney(report.openingCash.amountMinorUnits, report.openingCash.currency)}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell>{t('accounting.reports.closingCash')}</TableCell>
                <TableCell>{formatMoney(report.closingCash.amountMinorUnits, report.closingCash.currency)}</TableCell>
              </TableRow>
            </TableBody>
          </Table>

          <Badge variant={report.isConsistent ? 'default' : 'destructive'} className="justify-self-start">
            {report.isConsistent ? t('accounting.reports.consistent') : t('accounting.reports.inconsistent')}
          </Badge>
        </div>
      ) : null}
    </div>
  );
}

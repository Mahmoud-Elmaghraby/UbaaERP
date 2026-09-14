import { useQuery } from '@tanstack/react-query';
import type {
  BalanceSheetReportDto,
  CashFlowReportDto,
  GeneralLedgerReportDto,
  IncomeStatementReportDto,
  TrialBalanceReportDto,
} from '@erp-platform/contracts';

import { apiGet } from '../../../../lib/api-client';

/**
 * All four reports are read-only, computed on the fly (AccountingReportsService — none
 * back a stored table), and every one of them requires at least one query parameter the
 * backend rejects with a 400 if missing (accountId / asOfDate / fromDate+toDate — see
 * AccountingReportsController). Each hook below is `enabled` only once its own required
 * parameter(s) are present, matching that — the report view components gate their
 * "Run report" trigger the same way instead of firing on every keystroke.
 */

export function useGeneralLedgerReport(params: {
  accountId: string | undefined;
  fromDate?: string;
  toDate?: string;
}) {
  const { accountId, fromDate, toDate } = params;
  return useQuery({
    queryKey: ['accounting-reports', 'general-ledger', accountId, fromDate, toDate],
    queryFn: () => {
      const qs = new URLSearchParams({ accountId: accountId as string });
      if (fromDate) qs.set('fromDate', fromDate);
      if (toDate) qs.set('toDate', toDate);
      return apiGet<GeneralLedgerReportDto>(`/accounting-reports/general-ledger?${qs.toString()}`);
    },
    enabled: Boolean(accountId),
  });
}

export function useTrialBalanceReport(asOfDate: string | undefined) {
  return useQuery({
    queryKey: ['accounting-reports', 'trial-balance', asOfDate],
    queryFn: () =>
      apiGet<TrialBalanceReportDto>(`/accounting-reports/trial-balance?asOfDate=${asOfDate}`),
    enabled: Boolean(asOfDate),
  });
}

export function useIncomeStatementReport(params: { fromDate: string | undefined; toDate: string | undefined }) {
  const { fromDate, toDate } = params;
  return useQuery({
    queryKey: ['accounting-reports', 'income-statement', fromDate, toDate],
    queryFn: () =>
      apiGet<IncomeStatementReportDto>(
        `/accounting-reports/income-statement?fromDate=${fromDate}&toDate=${toDate}`,
      ),
    enabled: Boolean(fromDate) && Boolean(toDate),
  });
}

export function useBalanceSheetReport(asOfDate: string | undefined) {
  return useQuery({
    queryKey: ['accounting-reports', 'balance-sheet', asOfDate],
    queryFn: () =>
      apiGet<BalanceSheetReportDto>(`/accounting-reports/balance-sheet?asOfDate=${asOfDate}`),
    enabled: Boolean(asOfDate),
  });
}

export function useCashFlowReport(params: { fromDate: string | undefined; toDate: string | undefined }) {
  const { fromDate, toDate } = params;
  return useQuery({
    queryKey: ['accounting-reports', 'cash-flow-statement', fromDate, toDate],
    queryFn: () =>
      apiGet<CashFlowReportDto>(
        `/accounting-reports/cash-flow-statement?fromDate=${fromDate}&toDate=${toDate}`,
      ),
    enabled: Boolean(fromDate) && Boolean(toDate),
  });
}

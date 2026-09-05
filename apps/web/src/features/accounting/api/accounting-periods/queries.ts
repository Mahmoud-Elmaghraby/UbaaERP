import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AccountingPeriodDto } from '@erp-platform/contracts';

import { apiGet, apiPost } from '../../../../lib/api-client';

/**
 * No create/update/delete — accounting_periods are generated only by
 * FiscalYearsService.create() (see the contract's own comment) and this controller
 * only lists and toggles open/closed. FiscalYearPeriodsView reads periods via
 * useFiscalYearPeriods() (GET /fiscal-years/:id/periods) rather than this list —
 * both resolve to the same rows, that one is the more specific/scoped read. The
 * close()/reopen() mutations below are the ones actually used, invalidating both
 * query shapes so either view picks up the change.
 */
export function useAccountingPeriods(fiscalYearId: string | null | undefined) {
  return useQuery({
    queryKey: ['accounting-periods', 'by-fiscal-year', fiscalYearId],
    queryFn: () => apiGet<AccountingPeriodDto[]>(`/accounting-periods?fiscalYearId=${fiscalYearId}`),
    enabled: Boolean(fiscalYearId),
  });
}

function usePeriodTransition(action: 'close' | 'reopen') {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiPost<AccountingPeriodDto>(`/accounting-periods/${id}/${action}`),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['accounting-periods'] });
      queryClient.invalidateQueries({ queryKey: ['fiscal-years', data.fiscalYearId, 'periods'] });
    },
  });
}

export function useClosePeriod() {
  return usePeriodTransition('close');
}

export function useReopenPeriod() {
  return usePeriodTransition('reopen');
}

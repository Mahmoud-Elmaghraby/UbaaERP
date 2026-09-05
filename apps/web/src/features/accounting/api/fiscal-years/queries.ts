import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AccountingPeriodDto,
  CreateFiscalYearDto,
  FiscalYearDto,
  UpdateFiscalYearDto,
} from '@erp-platform/contracts';

import { apiDelete, apiGet, apiPatch, apiPost } from '../../../../lib/api-client';

const LIST_KEY = ['fiscal-years'];

export function useFiscalYears() {
  return useQuery({ queryKey: LIST_KEY, queryFn: () => apiGet<FiscalYearDto[]>('/fiscal-years') });
}

export function useFiscalYear(id: string | null | undefined) {
  return useQuery({
    queryKey: ['fiscal-years', id],
    queryFn: () => apiGet<FiscalYearDto>(`/fiscal-years/${id}`),
    enabled: Boolean(id),
  });
}

/** GET /fiscal-years/:id/periods — the one fiscal-year-scoped period listing exposed
 * directly on this controller (AccountingPeriodsController's own unscoped/?fiscalYearId=
 * list is the other way to reach the same rows — used by FiscalYearPeriodsView). */
export function useFiscalYearPeriods(fiscalYearId: string | null | undefined) {
  return useQuery({
    queryKey: ['fiscal-years', fiscalYearId, 'periods'],
    queryFn: () => apiGet<AccountingPeriodDto[]>(`/fiscal-years/${fiscalYearId}/periods`),
    enabled: Boolean(fiscalYearId),
  });
}

export function useCreateFiscalYear() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateFiscalYearDto) => apiPost<FiscalYearDto>('/fiscal-years', input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: LIST_KEY }),
  });
}

export function useUpdateFiscalYear() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateFiscalYearDto }) =>
      apiPatch<FiscalYearDto>(`/fiscal-years/${id}`, input),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: LIST_KEY });
      queryClient.invalidateQueries({ queryKey: ['fiscal-years', data.id] });
    },
  });
}

function useFiscalYearTransition(action: 'close' | 'reopen') {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiPost<FiscalYearDto>(`/fiscal-years/${id}/${action}`),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: LIST_KEY });
      queryClient.invalidateQueries({ queryKey: ['fiscal-years', data.id] });
    },
  });
}

export function useCloseFiscalYear() {
  return useFiscalYearTransition('close');
}

export function useReopenFiscalYear() {
  return useFiscalYearTransition('reopen');
}

export function useDeleteFiscalYear() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete<void>(`/fiscal-years/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: LIST_KEY }),
  });
}

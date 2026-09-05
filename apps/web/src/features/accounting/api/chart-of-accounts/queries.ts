import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ChartOfAccountDto,
  CreateChartOfAccountDto,
  UpdateChartOfAccountDto,
} from '@erp-platform/contracts';

import { apiDelete, apiGet, apiPatch, apiPost } from '../../../../lib/api-client';

const LIST_KEY = ['chart-of-accounts'];

/** Unscoped list — GET /chart-of-accounts?accountType=&isActive= are both optional
 * query filters, applied client-side here for the tree view rather than server-side,
 * since the whole chart is small (a few dozen accounts) and the tree needs every
 * account (active + inactive, every type) to render parent/child relationships
 * correctly regardless of filter. */
export function useChartOfAccounts() {
  return useQuery({
    queryKey: LIST_KEY,
    queryFn: () => apiGet<ChartOfAccountDto[]>('/chart-of-accounts'),
  });
}

export function useChartOfAccount(id: string | null | undefined) {
  return useQuery({
    queryKey: ['chart-of-accounts', id],
    queryFn: () => apiGet<ChartOfAccountDto>(`/chart-of-accounts/${id}`),
    enabled: Boolean(id),
  });
}

export function useCreateChartOfAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateChartOfAccountDto) => apiPost<ChartOfAccountDto>('/chart-of-accounts', input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: LIST_KEY }),
  });
}

export function useUpdateChartOfAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateChartOfAccountDto }) =>
      apiPatch<ChartOfAccountDto>(`/chart-of-accounts/${id}`, input),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: LIST_KEY });
      queryClient.invalidateQueries({ queryKey: ['chart-of-accounts', data.id] });
    },
  });
}

/** Delete is only actually possible for a non-system, childless, unreferenced account —
 * the backend enforces this (ChartOfAccountsService), the frontend just surfaces
 * whatever error message comes back (ApiError), same as every other entity. */
export function useDeleteChartOfAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete<void>(`/chart-of-accounts/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: LIST_KEY }),
  });
}

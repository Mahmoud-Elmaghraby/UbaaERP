import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SalesAnalysisQueryDto, SalesAnalysisReportDto, SalesRepDto, SaveSalesRepDto } from '@erp-platform/contracts';

import { apiDelete, apiGet, apiPost, apiPut } from '../../../../lib/api-client';

export function useSalesReps() {
  return useQuery({
    queryKey: ['sales-reps'],
    queryFn: () => apiGet<SalesRepDto[]>('/sales-reps'),
    staleTime: 60_000,
  });
}

export function useSaveSalesRep() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id?: string; input: SaveSalesRepDto }) =>
      id ? apiPut<SalesRepDto>(`/sales-reps/${id}`, input) : apiPost<SalesRepDto>('/sales-reps', input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['sales-reps'] }),
  });
}

export function useDeleteSalesRep() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete<void>(`/sales-reps/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['sales-reps'] }),
  });
}

export function useSalesAnalysis(query: SalesAnalysisQueryDto, enabled = true) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) if (value) params.set(key, String(value));
  return useQuery({
    queryKey: ['sales-reports', 'analysis', query],
    queryFn: () => apiGet<SalesAnalysisReportDto>(`/sales-reports/analysis?${params.toString()}`),
    enabled,
  });
}

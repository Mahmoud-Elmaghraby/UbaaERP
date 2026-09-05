import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CostCenterDto, CreateCostCenterDto, UpdateCostCenterDto } from '@erp-platform/contracts';

import { apiDelete, apiGet, apiPatch, apiPost } from '../../../../lib/api-client';

const LIST_KEY = ['cost-centers'];

export function useCostCenters() {
  return useQuery({ queryKey: LIST_KEY, queryFn: () => apiGet<CostCenterDto[]>('/cost-centers') });
}

export function useCostCenter(id: string | null | undefined) {
  return useQuery({
    queryKey: ['cost-centers', id],
    queryFn: () => apiGet<CostCenterDto>(`/cost-centers/${id}`),
    enabled: Boolean(id),
  });
}

export function useCreateCostCenter() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateCostCenterDto) => apiPost<CostCenterDto>('/cost-centers', input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: LIST_KEY }),
  });
}

export function useUpdateCostCenter() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateCostCenterDto }) =>
      apiPatch<CostCenterDto>(`/cost-centers/${id}`, input),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: LIST_KEY });
      queryClient.invalidateQueries({ queryKey: ['cost-centers', data.id] });
    },
  });
}

export function useDeleteCostCenter() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete<void>(`/cost-centers/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: LIST_KEY }),
  });
}

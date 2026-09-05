import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ApplyLandedCostDto, LandedCostDto } from '@erp-platform/contracts';

import { apiGet, apiPost } from '../../../../lib/api-client';

export function useLandedCosts() {
  return useQuery({ queryKey: ['landed-costs'], queryFn: () => apiGet<LandedCostDto[]>('/landed-costs') });
}

export function useLandedCost(id: string | undefined) {
  return useQuery({
    queryKey: ['landed-costs', id],
    queryFn: () => apiGet<LandedCostDto>(`/landed-costs/${id}`),
    enabled: Boolean(id),
  });
}

export function useApplyLandedCost() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ApplyLandedCostDto) => apiPost<LandedCostDto>('/landed-costs', input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['landed-costs'] });
      queryClient.invalidateQueries({ queryKey: ['stock-levels'] });
      queryClient.invalidateQueries({ queryKey: ['stock-movements'] });
    },
  });
}

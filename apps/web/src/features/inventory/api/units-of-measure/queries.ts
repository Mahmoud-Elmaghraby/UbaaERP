import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ConvertUnitOfMeasureDto,
  CreateUnitOfMeasureDto,
  UnitConversionResultDto,
  UnitOfMeasureDto,
  UpdateUnitOfMeasureDto,
} from '@erp-platform/contracts';

import { apiDelete, apiGet, apiPatch, apiPost } from '../../../../lib/api-client';

export function useUnitsOfMeasure() {
  return useQuery({
    queryKey: ['units-of-measure'],
    queryFn: () => apiGet<UnitOfMeasureDto[]>('/units-of-measure'),
  });
}

export function useCreateUnitOfMeasure() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateUnitOfMeasureDto) => apiPost<UnitOfMeasureDto>('/units-of-measure', input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['units-of-measure'] }),
  });
}

export function useUpdateUnitOfMeasure() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateUnitOfMeasureDto }) =>
      apiPatch<UnitOfMeasureDto>(`/units-of-measure/${id}`, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['units-of-measure'] }),
  });
}

export function useDeleteUnitOfMeasure() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete<void>(`/units-of-measure/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['units-of-measure'] }),
  });
}

export function useConvertUnitOfMeasure() {
  return useMutation({
    mutationFn: (input: ConvertUnitOfMeasureDto) => {
      const params = new URLSearchParams({
        fromUnitId: input.fromUnitId,
        toUnitId: input.toUnitId,
        quantity: String(input.quantity),
      });
      return apiGet<UnitConversionResultDto>(`/units-of-measure/convert?${params.toString()}`);
    },
  });
}

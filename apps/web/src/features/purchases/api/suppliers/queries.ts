import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateSupplierDto, SupplierDto, UpdateSupplierDto } from '@erp-platform/contracts';

import { apiDelete, apiGet, apiPatch, apiPost } from '../../../../lib/api-client';

export function useSuppliers() {
  return useQuery({ queryKey: ['suppliers'], queryFn: () => apiGet<SupplierDto[]>('/suppliers') });
}

export function useSupplier(id: string | null | undefined) {
  return useQuery({
    queryKey: ['suppliers', id],
    queryFn: () => apiGet<SupplierDto>(`/suppliers/${id}`),
    enabled: Boolean(id),
  });
}

export function useCreateSupplier() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateSupplierDto) => apiPost<SupplierDto>('/suppliers', input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['suppliers'] }),
  });
}

export function useUpdateSupplier() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateSupplierDto }) =>
      apiPatch<SupplierDto>(`/suppliers/${id}`, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['suppliers'] }),
  });
}

export function useDeleteSupplier() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete<void>(`/suppliers/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['suppliers'] }),
  });
}

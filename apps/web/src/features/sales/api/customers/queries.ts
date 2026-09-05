import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateCustomerDto, CustomerDto, UpdateCustomerDto } from '@erp-platform/contracts';

import { apiDelete, apiGet, apiPatch, apiPost } from '../../../../lib/api-client';

export function useCustomers() {
  return useQuery({ queryKey: ['customers'], queryFn: () => apiGet<CustomerDto[]>('/customers') });
}

export function useCustomer(id: string | null | undefined) {
  return useQuery({
    queryKey: ['customers', id],
    queryFn: () => apiGet<CustomerDto>(`/customers/${id}`),
    enabled: Boolean(id),
  });
}

export function useCreateCustomer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateCustomerDto) => apiPost<CustomerDto>('/customers', input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['customers'] }),
  });
}

export function useUpdateCustomer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateCustomerDto }) =>
      apiPatch<CustomerDto>(`/customers/${id}`, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['customers'] }),
  });
}

export function useDeleteCustomer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete<void>(`/customers/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['customers'] }),
  });
}

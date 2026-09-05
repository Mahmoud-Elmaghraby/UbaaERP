import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateSalesOrderDto, SalesOrderDto, SalesOrderWithLinesDto, UpdateSalesOrderDto } from '@erp-platform/contracts';

import { apiDelete, apiGet, apiPatch, apiPost } from '../../../../lib/api-client';

const LIST_KEY = ['sales-orders'];

export function useSalesOrders() {
  return useQuery({ queryKey: LIST_KEY, queryFn: () => apiGet<SalesOrderDto[]>('/sales-orders') });
}

export function useSalesOrder(id: string | null | undefined) {
  return useQuery({
    queryKey: ['sales-orders', id],
    queryFn: () => apiGet<SalesOrderWithLinesDto>(`/sales-orders/${id}`),
    enabled: Boolean(id),
  });
}

export function useCreateSalesOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateSalesOrderDto) => apiPost<SalesOrderWithLinesDto>('/sales-orders', input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: LIST_KEY });
      // Creating a sales order from a quotation doesn't change the quotation's own
      // status, but it does change whether it's still "eligible" for another sales
      // order (see hooks/sales-orders/use-eligible-quotations.ts).
      queryClient.invalidateQueries({ queryKey: ['quotations'] });
    },
  });
}

export function useUpdateSalesOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateSalesOrderDto }) =>
      apiPatch<SalesOrderWithLinesDto>(`/sales-orders/${id}`, input),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: LIST_KEY });
      queryClient.invalidateQueries({ queryKey: ['sales-orders', variables.id] });
    },
  });
}

function useStatusTransition(action: 'confirm' | 'cancel') {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiPost<SalesOrderDto>(`/sales-orders/${id}/${action}`),
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: LIST_KEY });
      queryClient.invalidateQueries({ queryKey: ['sales-orders', id] });
    },
  });
}

export function useConfirmSalesOrder() {
  return useStatusTransition('confirm');
}

export function useCancelSalesOrder() {
  return useStatusTransition('cancel');
}

export function useDeleteSalesOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete<void>(`/sales-orders/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: LIST_KEY }),
  });
}

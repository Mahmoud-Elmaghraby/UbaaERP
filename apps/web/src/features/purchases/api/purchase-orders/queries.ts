import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreatePurchaseOrderDto,
  PurchaseOrderDto,
  PurchaseOrderWithLinesDto,
  UpdatePurchaseOrderDto,
} from '@erp-platform/contracts';

import { apiDelete, apiGet, apiPatch, apiPost } from '../../../../lib/api-client';

export function usePurchaseOrders() {
  return useQuery({ queryKey: ['purchase-orders'], queryFn: () => apiGet<PurchaseOrderDto[]>('/purchase-orders') });
}

export function usePurchaseOrder(id: string | null | undefined) {
  return useQuery({
    queryKey: ['purchase-orders', id],
    queryFn: () => apiGet<PurchaseOrderWithLinesDto>(`/purchase-orders/${id}`),
    enabled: Boolean(id),
  });
}

export function useCreatePurchaseOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreatePurchaseOrderDto) => apiPost<PurchaseOrderWithLinesDto>('/purchase-orders', input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
      // Creating a PO from a quotation doesn't change the quotation's own
      // status, but it does change whether it's still "eligible" for another
      // PO (see hooks/purchase-orders/use-eligible-quotations.ts), so make
      // sure that derived list is recomputed too.
      queryClient.invalidateQueries({ queryKey: ['supplier-quotations'] });
    },
  });
}

export function useUpdatePurchaseOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdatePurchaseOrderDto }) =>
      apiPatch<PurchaseOrderWithLinesDto>(`/purchase-orders/${id}`, input),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
      queryClient.invalidateQueries({ queryKey: ['purchase-orders', variables.id] });
    },
  });
}

function useStatusTransition(action: 'confirm' | 'cancel') {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiPost<PurchaseOrderWithLinesDto>(`/purchase-orders/${id}/${action}`),
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
      queryClient.invalidateQueries({ queryKey: ['purchase-orders', id] });
    },
  });
}

export function useConfirmPurchaseOrder() {
  return useStatusTransition('confirm');
}

export function useCancelPurchaseOrder() {
  return useStatusTransition('cancel');
}

export function useDeletePurchaseOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete<void>(`/purchase-orders/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['purchase-orders'] }),
  });
}

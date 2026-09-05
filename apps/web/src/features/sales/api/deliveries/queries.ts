import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateDeliveryDto, DeliveryDto, DeliveryWithLinesDto } from '@erp-platform/contracts';

import { apiDelete, apiGet, apiPost } from '../../../../lib/api-client';

const LIST_KEY = ['deliveries'];

/** Unscoped list — like Goods Receipts, GET /deliveries has no required filter, so
 * Deliveries gets its own routed page with a plain master list. */
export function useDeliveries() {
  return useQuery({ queryKey: LIST_KEY, queryFn: () => apiGet<DeliveryDto[]>('/deliveries') });
}

/** Scoped list (?salesOrderId=) — used by the create form's delivering worksheet to find
 * what's already been delivered against a given sales order (see
 * hooks/deliveries/use-sales-order-remaining.ts). */
export function useDeliveriesBySalesOrder(salesOrderId: string | null | undefined) {
  return useQuery({
    queryKey: ['deliveries', 'by-so', salesOrderId],
    queryFn: () => apiGet<DeliveryDto[]>(`/deliveries?salesOrderId=${salesOrderId}`),
    enabled: Boolean(salesOrderId),
  });
}

export function useDelivery(id: string | null | undefined) {
  return useQuery({
    queryKey: ['deliveries', id],
    queryFn: () => apiGet<DeliveryWithLinesDto>(`/deliveries/${id}`),
    enabled: Boolean(id),
  });
}

export function useCreateDelivery() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateDeliveryDto) => apiPost<DeliveryWithLinesDto>('/deliveries', input),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: LIST_KEY });
      queryClient.invalidateQueries({ queryKey: ['deliveries', 'by-so', data.salesOrderId] });
    },
  });
}

/** No useUpdateDelivery — same as Goods Receipts, the backend has no update() at all
 * (a wrong draft is cancelled/deleted and recreated instead). */

function useStatusTransition(action: 'confirm' | 'cancel') {
  const queryClient = useQueryClient();
  return useMutation({
    // confirm() actually returns a DeliveryWithLinesDto and cancel() a plain
    // DeliveryDto (per the controller) — typed here as the narrower DeliveryDto, which
    // both responses satisfy structurally, since only id/salesOrderId/status are read
    // from the result.
    mutationFn: (id: string) => apiPost<DeliveryDto>(`/deliveries/${id}/${action}`),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: LIST_KEY });
      queryClient.invalidateQueries({ queryKey: ['deliveries', data.id] });
      queryClient.invalidateQueries({ queryKey: ['deliveries', 'by-so', data.salesOrderId] });
      // Confirming a delivery recomputes the parent sales order's status
      // (partially_delivered/fully_delivered) server-side in the same transaction.
      queryClient.invalidateQueries({ queryKey: ['sales-orders'] });
    },
  });
}

export function useConfirmDelivery() {
  return useStatusTransition('confirm');
}

export function useCancelDelivery() {
  return useStatusTransition('cancel');
}

export function useDeleteDelivery() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete<void>(`/deliveries/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: LIST_KEY }),
  });
}

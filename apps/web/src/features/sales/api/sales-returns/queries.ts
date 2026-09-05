import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateSalesReturnDto,
  SalesReturnConfirmationDto,
  SalesReturnDto,
  SalesReturnWithLinesDto,
} from '@erp-platform/contracts';

import { apiDelete, apiGet, apiPost } from '../../../../lib/api-client';

const LIST_KEY = ['sales-returns'];

/** Unscoped list — like Purchase Returns, GET /sales-returns has no required filter, so
 * Sales Returns gets its own routed page with a plain master list. */
export function useSalesReturns() {
  return useQuery({ queryKey: LIST_KEY, queryFn: () => apiGet<SalesReturnDto[]>('/sales-returns') });
}

/** Scoped list (?deliveryId=) — used by the create form's returnable worksheet to find
 * what's already been returned against a given delivery (see
 * hooks/sales-returns/use-delivery-returnable.ts). */
export function useSalesReturnsByDelivery(deliveryId: string | null | undefined) {
  return useQuery({
    queryKey: ['sales-returns', 'by-delivery', deliveryId],
    queryFn: () => apiGet<SalesReturnDto[]>(`/sales-returns?deliveryId=${deliveryId}`),
    enabled: Boolean(deliveryId),
  });
}

export function useSalesReturn(id: string | null | undefined) {
  return useQuery({
    queryKey: ['sales-returns', id],
    queryFn: () => apiGet<SalesReturnWithLinesDto>(`/sales-returns/${id}`),
    enabled: Boolean(id),
  });
}

export function useCreateSalesReturn() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateSalesReturnDto) => apiPost<SalesReturnWithLinesDto>('/sales-returns', input),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: LIST_KEY });
      queryClient.invalidateQueries({ queryKey: ['sales-returns', 'by-delivery', data.deliveryId] });
    },
  });
}

/** No useUpdateSalesReturn — same as Purchase Returns, the backend has no update() at
 * all (a wrong draft is cancelled/deleted and recreated instead). */

function useStatusTransition(action: 'confirm' | 'cancel') {
  const queryClient = useQueryClient();
  return useMutation({
    // confirm() actually returns a SalesReturnWithLinesDto-shaped confirmation and
    // cancel() a plain SalesReturnDto — typed here as the narrower SalesReturnDto,
    // which both responses satisfy structurally, since only id/deliveryId/status are
    // read from the result (same reasoning as Purchase Returns' own queries.ts).
    mutationFn: (id: string) => apiPost<SalesReturnDto>(`/sales-returns/${id}/${action}`),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: LIST_KEY });
      queryClient.invalidateQueries({ queryKey: ['sales-returns', data.id] });
      queryClient.invalidateQueries({ queryKey: ['sales-returns', 'by-delivery', data.deliveryId] });
    },
  });
}

/**
 * confirm() is the one status transition with a wider response shape than plain
 * SalesReturnDto — SalesReturnConfirmationDto adds creditNoteId, since confirming a
 * return also auto-generates its Sales Credit Note in the same transaction (migration
 * 0053, SalesReturnsService.confirm()). Typed and handled separately from the generic
 * useStatusTransition('confirm') above so callers (e.g. SalesReturnsTab) can surface
 * the resulting credit note without a second round-trip, and so the new credit note
 * shows up immediately in its own list/detail queries.
 */
export function useConfirmSalesReturn() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiPost<SalesReturnConfirmationDto>(`/sales-returns/${id}/confirm`),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: LIST_KEY });
      queryClient.invalidateQueries({ queryKey: ['sales-returns', data.id] });
      queryClient.invalidateQueries({ queryKey: ['sales-returns', 'by-delivery', data.deliveryId] });
      queryClient.invalidateQueries({ queryKey: ['sales-credit-notes'] });
    },
  });
}

export function useCancelSalesReturn() {
  return useStatusTransition('cancel');
}

export function useDeleteSalesReturn() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete<void>(`/sales-returns/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: LIST_KEY }),
  });
}

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreatePurchaseReturnDto, PurchaseReturnDto, PurchaseReturnWithLinesDto } from '@erp-platform/contracts';

import { apiDelete, apiGet, apiPost } from '../../../../lib/api-client';

const LIST_KEY = ['purchase-returns'];

/** Unscoped list — like Goods Receipts (and unlike Supplier Quotations), GET
 * /purchase-returns has no required filter, so Purchase Returns gets its own routed
 * page with a plain master list. */
export function usePurchaseReturns() {
  return useQuery({ queryKey: LIST_KEY, queryFn: () => apiGet<PurchaseReturnDto[]>('/purchase-returns') });
}

/** Scoped list (?goodsReceiptId=) — used by the create form's returnable worksheet to
 * find what's already been returned against a given goods receipt (see
 * hooks/purchase-returns/use-goods-receipt-returnable.ts). */
export function usePurchaseReturnsByGoodsReceipt(goodsReceiptId: string | null | undefined) {
  return useQuery({
    queryKey: ['purchase-returns', 'by-receipt', goodsReceiptId],
    queryFn: () => apiGet<PurchaseReturnDto[]>(`/purchase-returns?goodsReceiptId=${goodsReceiptId}`),
    enabled: Boolean(goodsReceiptId),
  });
}

export function usePurchaseReturn(id: string | null | undefined) {
  return useQuery({
    queryKey: ['purchase-returns', id],
    queryFn: () => apiGet<PurchaseReturnWithLinesDto>(`/purchase-returns/${id}`),
    enabled: Boolean(id),
  });
}

export function useCreatePurchaseReturn() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreatePurchaseReturnDto) => apiPost<PurchaseReturnWithLinesDto>('/purchase-returns', input),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: LIST_KEY });
      queryClient.invalidateQueries({ queryKey: ['purchase-returns', 'by-receipt', data.goodsReceiptId] });
    },
  });
}

/** No useUpdatePurchaseReturn — same as Goods Receipts, the backend has no update() at
 * all (a wrong draft is cancelled/deleted and recreated instead). */

function useStatusTransition(action: 'confirm' | 'cancel') {
  const queryClient = useQueryClient();
  return useMutation({
    // confirm() actually returns a PurchaseReturnWithLinesDto-shaped confirmation and
    // cancel() a plain PurchaseReturnDto — typed here as the narrower PurchaseReturnDto,
    // which both responses satisfy structurally, since only id/goodsReceiptId/status
    // are read from the result (same reasoning as Goods Receipts' own queries.ts).
    mutationFn: (id: string) => apiPost<PurchaseReturnDto>(`/purchase-returns/${id}/${action}`),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: LIST_KEY });
      queryClient.invalidateQueries({ queryKey: ['purchase-returns', data.id] });
      queryClient.invalidateQueries({ queryKey: ['purchase-returns', 'by-receipt', data.goodsReceiptId] });
    },
  });
}

export function useConfirmPurchaseReturn() {
  return useStatusTransition('confirm');
}

export function useCancelPurchaseReturn() {
  return useStatusTransition('cancel');
}

export function useDeletePurchaseReturn() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete<void>(`/purchase-returns/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: LIST_KEY }),
  });
}

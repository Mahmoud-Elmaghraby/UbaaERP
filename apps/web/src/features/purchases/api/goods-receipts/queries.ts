import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateGoodsReceiptDto, GoodsReceiptDto, GoodsReceiptWithLinesDto } from '@erp-platform/contracts';

import { apiDelete, apiGet, apiPost } from '../../../../lib/api-client';

const LIST_KEY = ['goods-receipts'];

/** Unscoped list — unlike Supplier Quotations, GET /goods-receipts has no required
 * filter, so Goods Receipts get their own routed page with a plain master list. */
export function useGoodsReceipts() {
  return useQuery({ queryKey: LIST_KEY, queryFn: () => apiGet<GoodsReceiptDto[]>('/goods-receipts') });
}

/** Scoped list (?purchaseOrderId=) — used by the create form's receiving worksheet to
 * find what's already been received against a given PO (see
 * hooks/goods-receipts/use-purchase-order-remaining.ts). */
export function useGoodsReceiptsByPurchaseOrder(purchaseOrderId: string | null | undefined) {
  return useQuery({
    queryKey: ['goods-receipts', 'by-po', purchaseOrderId],
    queryFn: () => apiGet<GoodsReceiptDto[]>(`/goods-receipts?purchaseOrderId=${purchaseOrderId}`),
    enabled: Boolean(purchaseOrderId),
  });
}

export function useGoodsReceipt(id: string | null | undefined) {
  return useQuery({
    queryKey: ['goods-receipts', id],
    queryFn: () => apiGet<GoodsReceiptWithLinesDto>(`/goods-receipts/${id}`),
    enabled: Boolean(id),
  });
}

export function useCreateGoodsReceipt() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateGoodsReceiptDto) => apiPost<GoodsReceiptWithLinesDto>('/goods-receipts', input),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: LIST_KEY });
      queryClient.invalidateQueries({ queryKey: ['goods-receipts', 'by-po', data.purchaseOrderId] });
    },
  });
}

/** No useUpdateGoodsReceipt — the backend has no update() at all (a wrong draft is
 * cancelled/deleted and recreated instead — see GoodsReceiptsService's own doc comment). */

/** confirm() actually returns a GoodsReceiptWithLinesDto and cancel() a plain
 * GoodsReceiptDto (per the controller) — typed here as the narrower GoodsReceiptDto,
 * which both responses satisfy structurally, since only id/purchaseOrderId/status
 * are read from the result. */
function useStatusTransition(action: 'confirm' | 'cancel') {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiPost<GoodsReceiptDto>(`/goods-receipts/${id}/${action}`),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: LIST_KEY });
      queryClient.invalidateQueries({ queryKey: ['goods-receipts', data.id] });
      queryClient.invalidateQueries({ queryKey: ['goods-receipts', 'by-po', data.purchaseOrderId] });
      // Confirming a receipt recomputes the parent PO's status
      // (partially_received/fully_received) server-side in the same transaction.
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
    },
  });
}

export function useConfirmGoodsReceipt() {
  return useStatusTransition('confirm');
}

export function useCancelGoodsReceipt() {
  return useStatusTransition('cancel');
}

export function useDeleteGoodsReceipt() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete<void>(`/goods-receipts/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: LIST_KEY }),
  });
}

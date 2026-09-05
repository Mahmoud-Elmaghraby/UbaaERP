import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreatePurchaseInvoiceDto, PurchaseInvoiceDto, PurchaseInvoiceWithLinesDto } from '@erp-platform/contracts';

import { apiDelete, apiGet, apiPost } from '../../../../lib/api-client';

const LIST_KEY = ['purchase-invoices'];

/** Unscoped list — like Goods Receipts and Purchase Returns, GET /purchase-invoices has
 * no required filter, so Purchase Invoices gets its own routed page with a plain master
 * list. */
export function usePurchaseInvoices() {
  return useQuery({ queryKey: LIST_KEY, queryFn: () => apiGet<PurchaseInvoiceDto[]>('/purchase-invoices') });
}

/** Scoped list (?purchaseOrderId=) — used by the create form's invoicing worksheet to
 * find what's already been invoiced against a given PO (see
 * hooks/purchase-invoices/use-purchase-order-invoiceable.ts). */
export function usePurchaseInvoicesByPurchaseOrder(purchaseOrderId: string | null | undefined) {
  return useQuery({
    queryKey: ['purchase-invoices', 'by-po', purchaseOrderId],
    queryFn: () => apiGet<PurchaseInvoiceDto[]>(`/purchase-invoices?purchaseOrderId=${purchaseOrderId}`),
    enabled: Boolean(purchaseOrderId),
  });
}

export function usePurchaseInvoice(id: string | null | undefined) {
  return useQuery({
    queryKey: ['purchase-invoices', id],
    queryFn: () => apiGet<PurchaseInvoiceWithLinesDto>(`/purchase-invoices/${id}`),
    enabled: Boolean(id),
  });
}

export function useCreatePurchaseInvoice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreatePurchaseInvoiceDto) =>
      apiPost<PurchaseInvoiceWithLinesDto>('/purchase-invoices', input),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: LIST_KEY });
      queryClient.invalidateQueries({ queryKey: ['purchase-invoices', 'by-po', data.purchaseOrderId] });
    },
  });
}

/** No useUpdatePurchaseInvoice — same as Goods Receipts and Purchase Returns, the backend
 * has no update() at all (a wrong draft is cancelled/deleted and recreated instead). */

/** Posting (not "confirming" — matches the backend's own /:id/post route and accounting
 * terminology: a posted invoice is a ledger-worthy fact) is the one action in this whole
 * module whose integration event goes through the Outbox rather than the plain Event Bus
 * (see PurchaseInvoicesService.post()'s own doc comment) — but that's a backend-only
 * distinction; from here it's just another one-way POST /:id/post, same shape as every
 * other status transition in this module. */
function useStatusTransition(action: 'post' | 'cancel') {
  const queryClient = useQueryClient();
  return useMutation({
    // post() actually returns a PurchaseInvoiceWithLinesDto and cancel() a plain
    // PurchaseInvoiceDto (per the controller) — typed here as the narrower
    // PurchaseInvoiceDto, which both responses satisfy structurally, since only
    // id/purchaseOrderId/status are read from the result.
    mutationFn: (id: string) => apiPost<PurchaseInvoiceDto>(`/purchase-invoices/${id}/${action}`),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: LIST_KEY });
      queryClient.invalidateQueries({ queryKey: ['purchase-invoices', data.id] });
      queryClient.invalidateQueries({ queryKey: ['purchase-invoices', 'by-po', data.purchaseOrderId] });
    },
  });
}

export function usePostPurchaseInvoice() {
  return useStatusTransition('post');
}

export function useCancelPurchaseInvoice() {
  return useStatusTransition('cancel');
}

export function useDeletePurchaseInvoice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete<void>(`/purchase-invoices/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: LIST_KEY }),
  });
}

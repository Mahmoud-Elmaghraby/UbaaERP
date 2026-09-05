import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateSalesInvoiceDto, SalesInvoiceDto, SalesInvoiceWithLinesDto } from '@erp-platform/contracts';

import { apiDelete, apiGet, apiPost } from '../../../../lib/api-client';

const LIST_KEY = ['sales-invoices'];

export function useSalesInvoices() {
  return useQuery({ queryKey: LIST_KEY, queryFn: () => apiGet<SalesInvoiceDto[]>('/sales-invoices') });
}

export function useSalesInvoicesBySalesOrder(salesOrderId: string | null | undefined) {
  return useQuery({
    queryKey: ['sales-invoices', 'by-so', salesOrderId],
    queryFn: () => apiGet<SalesInvoiceDto[]>(`/sales-invoices?salesOrderId=${salesOrderId}`),
    enabled: Boolean(salesOrderId),
  });
}

export function useSalesInvoice(id: string | null | undefined) {
  return useQuery({
    queryKey: ['sales-invoices', id],
    queryFn: () => apiGet<SalesInvoiceWithLinesDto>(`/sales-invoices/${id}`),
    enabled: Boolean(id),
  });
}

export function useCreateSalesInvoice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateSalesInvoiceDto) => apiPost<SalesInvoiceWithLinesDto>('/sales-invoices', input),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: LIST_KEY });
      queryClient.invalidateQueries({ queryKey: ['sales-invoices', 'by-so', data.salesOrderId] });
    },
  });
}

/** No useUpdateSalesInvoice — same as Purchase Invoices, the backend has no update() at
 * all (a wrong draft is cancelled/deleted and recreated instead). */

/** Posting is the one action in this whole entity whose integration event goes through
 * the Outbox rather than the plain Event Bus (see SalesInvoicesService.post()'s own doc
 * comment) — but that's a backend-only distinction; from here it's just another
 * one-way POST /:id/post, same shape as every other status transition. */
function useStatusTransition(action: 'post' | 'cancel') {
  const queryClient = useQueryClient();
  return useMutation({
    // post() actually returns a SalesInvoiceWithLinesDto and cancel() a plain
    // SalesInvoiceDto (per the controller) — typed here as the narrower
    // SalesInvoiceDto, which both responses satisfy structurally, since only
    // id/salesOrderId/status are read from the result.
    mutationFn: (id: string) => apiPost<SalesInvoiceDto>(`/sales-invoices/${id}/${action}`),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: LIST_KEY });
      queryClient.invalidateQueries({ queryKey: ['sales-invoices', data.id] });
      queryClient.invalidateQueries({ queryKey: ['sales-invoices', 'by-so', data.salesOrderId] });
    },
  });
}

export function usePostSalesInvoice() {
  return useStatusTransition('post');
}

export function useCancelSalesInvoice() {
  return useStatusTransition('cancel');
}

export function useDeleteSalesInvoice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete<void>(`/sales-invoices/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: LIST_KEY }),
  });
}

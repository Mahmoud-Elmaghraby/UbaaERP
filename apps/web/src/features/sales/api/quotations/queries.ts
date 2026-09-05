import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateQuotationDto, QuotationDto, QuotationWithLinesDto, UpdateQuotationDto } from '@erp-platform/contracts';

import { apiDelete, apiGet, apiPatch, apiPost } from '../../../../lib/api-client';

const LIST_KEY = ['quotations'];

/** Unscoped list — GET /quotations has no required filter (a quotation is the first
 * document in the Sales chain, nothing scopes it to a parent), so Quotations gets its
 * own routed page with a plain master list, same as Purchase Orders. */
export function useQuotations() {
  return useQuery({ queryKey: LIST_KEY, queryFn: () => apiGet<QuotationDto[]>('/quotations') });
}

export function useQuotation(id: string | null | undefined) {
  return useQuery({
    queryKey: ['quotations', id],
    queryFn: () => apiGet<QuotationWithLinesDto>(`/quotations/${id}`),
    enabled: Boolean(id),
  });
}

export function useCreateQuotation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateQuotationDto) => apiPost<QuotationWithLinesDto>('/quotations', input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: LIST_KEY }),
  });
}

export function useUpdateQuotation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateQuotationDto }) =>
      apiPatch<QuotationWithLinesDto>(`/quotations/${id}`, input),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: LIST_KEY });
      queryClient.invalidateQueries({ queryKey: ['quotations', variables.id] });
    },
  });
}

/** send -> 'sent', accept/reject only from 'sent', cancel from 'draft'|'sent' — matches
 * QuotationsService.transitionStatus()'s own from/to pairs exactly; the frontend doesn't
 * re-derive these, it just offers the actions and lets the backend be authoritative. */
function useStatusTransition(action: 'send' | 'accept' | 'reject' | 'cancel') {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiPost<QuotationDto>(`/quotations/${id}/${action}`),
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: LIST_KEY });
      queryClient.invalidateQueries({ queryKey: ['quotations', id] });
    },
  });
}

export function useSendQuotation() {
  return useStatusTransition('send');
}

export function useAcceptQuotation() {
  return useStatusTransition('accept');
}

export function useRejectQuotation() {
  return useStatusTransition('reject');
}

export function useCancelQuotation() {
  return useStatusTransition('cancel');
}

export function useDeleteQuotation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete<void>(`/quotations/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: LIST_KEY }),
  });
}

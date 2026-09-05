import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateRfqDto, RfqDto, RfqWithDetailsDto, UpdateRfqDto } from '@erp-platform/contracts';

import { apiDelete, apiGet, apiPatch, apiPost } from '../../../../lib/api-client';

const LIST_KEY = ['rfqs'];

export function useRfqs() {
  return useQuery({ queryKey: LIST_KEY, queryFn: () => apiGet<RfqDto[]>('/rfqs') });
}

export function useRfq(id: string | null | undefined) {
  return useQuery({
    queryKey: ['rfqs', id],
    queryFn: () => apiGet<RfqWithDetailsDto>(`/rfqs/${id}`),
    enabled: Boolean(id),
  });
}

export function useCreateRfq() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateRfqDto) => apiPost<RfqWithDetailsDto>('/rfqs', input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: LIST_KEY }),
  });
}

export function useUpdateRfq() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateRfqDto }) =>
      apiPatch<RfqWithDetailsDto>(`/rfqs/${id}`, input),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: LIST_KEY });
      queryClient.invalidateQueries({ queryKey: ['rfqs', variables.id] });
    },
  });
}

/** Shared shape for the two one-way status-transition endpoints — neither takes a body.
 * 'closed' is never in this list — it's only ever reached internally via a supplier
 * quotation being selected (RfqsService.close(), not exposed as its own HTTP action). */
function useStatusTransition(action: 'send' | 'cancel') {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiPost<RfqDto>(`/rfqs/${id}/${action}`),
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: LIST_KEY });
      queryClient.invalidateQueries({ queryKey: ['rfqs', id] });
    },
  });
}

export function useSendRfq() {
  return useStatusTransition('send');
}

export function useCancelRfq() {
  return useStatusTransition('cancel');
}

export function useDeleteRfq() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete<void>(`/rfqs/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: LIST_KEY }),
  });
}

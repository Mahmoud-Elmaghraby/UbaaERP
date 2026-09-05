import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreatePurchaseRequisitionDto,
  PurchaseRequisitionDto,
  PurchaseRequisitionWithLinesDto,
  UpdatePurchaseRequisitionDto,
} from '@erp-platform/contracts';

import { apiDelete, apiGet, apiPatch, apiPost } from '../../../../lib/api-client';

const LIST_KEY = ['purchase-requisitions'];

export function usePurchaseRequisitions() {
  return useQuery({
    queryKey: LIST_KEY,
    queryFn: () => apiGet<PurchaseRequisitionDto[]>('/purchase-requisitions'),
  });
}

export function usePurchaseRequisition(id: string | null | undefined) {
  return useQuery({
    queryKey: ['purchase-requisitions', id],
    queryFn: () => apiGet<PurchaseRequisitionWithLinesDto>(`/purchase-requisitions/${id}`),
    enabled: Boolean(id),
  });
}

export function useCreatePurchaseRequisition() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreatePurchaseRequisitionDto) =>
      apiPost<PurchaseRequisitionWithLinesDto>('/purchase-requisitions', input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: LIST_KEY }),
  });
}

export function useUpdatePurchaseRequisition() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdatePurchaseRequisitionDto }) =>
      apiPatch<PurchaseRequisitionWithLinesDto>(`/purchase-requisitions/${id}`, input),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: LIST_KEY });
      queryClient.invalidateQueries({ queryKey: ['purchase-requisitions', variables.id] });
    },
  });
}

/** Shared shape for the four one-way status-transition endpoints — none take a body. */
function useStatusTransition(action: 'submit' | 'approve' | 'reject' | 'cancel') {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiPost<PurchaseRequisitionDto>(`/purchase-requisitions/${id}/${action}`),
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: LIST_KEY });
      queryClient.invalidateQueries({ queryKey: ['purchase-requisitions', id] });
    },
  });
}

export function useSubmitPurchaseRequisition() {
  return useStatusTransition('submit');
}

export function useApprovePurchaseRequisition() {
  return useStatusTransition('approve');
}

export function useRejectPurchaseRequisition() {
  return useStatusTransition('reject');
}

export function useCancelPurchaseRequisition() {
  return useStatusTransition('cancel');
}

export function useDeletePurchaseRequisition() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete<void>(`/purchase-requisitions/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: LIST_KEY }),
  });
}

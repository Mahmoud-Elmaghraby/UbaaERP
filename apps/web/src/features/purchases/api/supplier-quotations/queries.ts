import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateSupplierQuotationDto,
  SupplierQuotationDto,
  SupplierQuotationWithLinesDto,
  UpdateSupplierQuotationDto,
} from '@erp-platform/contracts';

import { apiDelete, apiGet, apiPatch, apiPost } from '../../../../lib/api-client';

/** Always scoped to one RFQ — there is no unscoped "all quotations" list in this UI,
 * matching the backend's ?rfqId= filter and the fact that a quotation is only ever
 * meaningful in the context of the RFQ it responds to. */
export function useSupplierQuotations(rfqId: string | null | undefined) {
  return useQuery({
    queryKey: ['supplier-quotations', 'by-rfq', rfqId],
    queryFn: () => apiGet<SupplierQuotationDto[]>(`/supplier-quotations?rfqId=${rfqId}`),
    enabled: Boolean(rfqId),
  });
}

export function useSupplierQuotation(id: string | null | undefined) {
  return useQuery({
    queryKey: ['supplier-quotations', id],
    queryFn: () => apiGet<SupplierQuotationWithLinesDto>(`/supplier-quotations/${id}`),
    enabled: Boolean(id),
  });
}

function invalidateQuotation(
  queryClient: ReturnType<typeof useQueryClient>,
  id: string,
  rfqId: string | undefined,
) {
  if (rfqId) queryClient.invalidateQueries({ queryKey: ['supplier-quotations', 'by-rfq', rfqId] });
  queryClient.invalidateQueries({ queryKey: ['supplier-quotations', id] });
  // Selecting/rejecting a quotation can close the RFQ or affect its siblings' status,
  // so the RFQ detail (and list, for its status badge) must be invalidated too.
  queryClient.invalidateQueries({ queryKey: ['rfqs'] });
}

export function useCreateSupplierQuotation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateSupplierQuotationDto) =>
      apiPost<SupplierQuotationWithLinesDto>('/supplier-quotations', input),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['supplier-quotations', 'by-rfq', data.rfqId] });
    },
  });
}

export function useUpdateSupplierQuotation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateSupplierQuotationDto }) =>
      apiPatch<SupplierQuotationWithLinesDto>(`/supplier-quotations/${id}`, input),
    onSuccess: (data) => invalidateQuotation(queryClient, data.id, data.rfqId),
  });
}

function useQuotationTransition(action: 'select' | 'reject') {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiPost<SupplierQuotationDto>(`/supplier-quotations/${id}/${action}`),
    onSuccess: (data) => invalidateQuotation(queryClient, data.id, data.rfqId),
  });
}

export function useSelectSupplierQuotation() {
  return useQuotationTransition('select');
}

export function useRejectSupplierQuotation() {
  return useQuotationTransition('reject');
}

export function useDeleteSupplierQuotation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: string; rfqId: string }) => apiDelete<void>(`/supplier-quotations/${id}`),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['supplier-quotations', 'by-rfq', variables.rfqId] });
    },
  });
}

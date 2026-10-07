import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AllocateSupplierPaymentDto,
  CreateSupplierPaymentDto,
  SupplierOutstandingInvoiceDto,
  SupplierPaymentDto,
  SupplierPaymentWithAllocationsDto,
} from '@erp-platform/contracts';

import { apiDelete, apiGet, apiPost } from '../../../../lib/api-client';

const LIST_KEY = ['supplier-payments'];
const OUTSTANDING_KEY = ['supplier-payments', 'outstanding-invoices'];

export function useSupplierPayments() {
  return useQuery({ queryKey: LIST_KEY, queryFn: () => apiGet<SupplierPaymentDto[]>('/supplier-payments') });
}

export function useSupplierPayment(id: string | null | undefined) {
  return useQuery({
    queryKey: ['supplier-payments', id],
    queryFn: () => apiGet<SupplierPaymentWithAllocationsDto>(`/supplier-payments/${id}`),
    enabled: Boolean(id),
  });
}

/** The supplier's posted purchase invoices with total / paid / outstanding — server-computed. */
export function useSupplierOutstandingInvoices(supplierId: string | null | undefined) {
  return useQuery({
    queryKey: [...OUTSTANDING_KEY, supplierId],
    queryFn: () =>
      apiGet<SupplierOutstandingInvoiceDto[]>(`/supplier-payments/outstanding-invoices?supplierId=${supplierId}`),
    enabled: Boolean(supplierId),
  });
}

function useInvalidate() {
  const queryClient = useQueryClient();
  return (id?: string) => {
    queryClient.invalidateQueries({ queryKey: LIST_KEY, exact: true });
    queryClient.invalidateQueries({ queryKey: OUTSTANDING_KEY });
    if (id) queryClient.invalidateQueries({ queryKey: ['supplier-payments', id] });
  };
}

export function useCreateSupplierPayment() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: CreateSupplierPaymentDto) =>
      apiPost<SupplierPaymentWithAllocationsDto>('/supplier-payments', input),
    onSuccess: () => invalidate(),
  });
}

/** Posting and allocating write their event to the Outbox server-side (CLAUDE.md §2.7). */
export function usePostSupplierPayment() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: string) => apiPost<SupplierPaymentWithAllocationsDto>(`/supplier-payments/${id}/post`),
    onSuccess: (data) => invalidate(data.id),
  });
}

export function useAllocateSupplierPayment() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: AllocateSupplierPaymentDto }) =>
      apiPost<SupplierPaymentWithAllocationsDto>(`/supplier-payments/${id}/allocate`, input),
    onSuccess: (data) => invalidate(data.id),
  });
}

export function useCancelSupplierPayment() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: string) => apiPost<SupplierPaymentDto>(`/supplier-payments/${id}/cancel`),
    onSuccess: (data) => invalidate(data.id),
  });
}

export function useDeleteSupplierPayment() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: string) => apiDelete<void>(`/supplier-payments/${id}`),
    onSuccess: () => invalidate(),
  });
}

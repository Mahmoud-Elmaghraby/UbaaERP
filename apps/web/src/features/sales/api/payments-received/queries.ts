import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AllocatePaymentReceivedDto,
  CreatePaymentReceivedDto,
  PaymentReceivedDto,
  PaymentReceivedWithAllocationsDto,
} from '@erp-platform/contracts';

import { apiDelete, apiGet, apiPost } from '../../../../lib/api-client';

const LIST_KEY = ['payments-received'];

export function usePaymentsReceived() {
  return useQuery({ queryKey: LIST_KEY, queryFn: () => apiGet<PaymentReceivedDto[]>('/payments-received') });
}

/** Scoped list (?customerId=) — used by hooks/payments-received/use-customer-invoices.ts'
 * sibling concern is invoices, not payments, so this is currently unused by any form but
 * kept for parity with every other entity's own by-parent list (and for a future
 * customer-statement view). */
export function usePaymentsReceivedByCustomer(customerId: string | null | undefined) {
  return useQuery({
    queryKey: ['payments-received', 'by-customer', customerId],
    queryFn: () => apiGet<PaymentReceivedDto[]>(`/payments-received?customerId=${customerId}`),
    enabled: Boolean(customerId),
  });
}

export function usePaymentReceived(id: string | null | undefined) {
  return useQuery({
    queryKey: ['payments-received', id],
    queryFn: () => apiGet<PaymentReceivedWithAllocationsDto>(`/payments-received/${id}`),
    enabled: Boolean(id),
  });
}

export function useCreatePaymentReceived() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreatePaymentReceivedDto) =>
      apiPost<PaymentReceivedWithAllocationsDto>('/payments-received', input),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: LIST_KEY });
      queryClient.invalidateQueries({ queryKey: ['payments-received', 'by-customer', data.customerId] });
    },
  });
}

/**
 * Posting and allocating are the two actions in this whole module that do NOT call
 * events.publish() — both write their integration event to the Outbox atomically with
 * the DB write inside the service method itself (CLAUDE.md §2.7), same as Sales
 * Invoices' post(). Both return a PaymentReceivedWithAllocationsDto.
 */
export function usePostPaymentReceived() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiPost<PaymentReceivedWithAllocationsDto>(`/payments-received/${id}/post`),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: LIST_KEY });
      queryClient.invalidateQueries({ queryKey: ['payments-received', data.id] });
      queryClient.invalidateQueries({ queryKey: ['payments-received', 'by-customer', data.customerId] });
      queryClient.invalidateQueries({ queryKey: ['sales-invoices'] });
    },
  });
}

/** Applies a posted payment's unallocated remainder to one or more additional sales
 * invoices — see PaymentsReceivedController's own doc comment on why this exists. */
export function useAllocatePaymentReceived() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: AllocatePaymentReceivedDto }) =>
      apiPost<PaymentReceivedWithAllocationsDto>(`/payments-received/${id}/allocate`, input),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: LIST_KEY });
      queryClient.invalidateQueries({ queryKey: ['payments-received', data.id] });
      queryClient.invalidateQueries({ queryKey: ['payments-received', 'by-customer', data.customerId] });
      queryClient.invalidateQueries({ queryKey: ['sales-invoices'] });
    },
  });
}

export function useCancelPaymentReceived() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiPost<PaymentReceivedDto>(`/payments-received/${id}/cancel`),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: LIST_KEY });
      queryClient.invalidateQueries({ queryKey: ['payments-received', data.id] });
      queryClient.invalidateQueries({ queryKey: ['payments-received', 'by-customer', data.customerId] });
    },
  });
}

export function useDeletePaymentReceived() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete<void>(`/payments-received/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: LIST_KEY }),
  });
}

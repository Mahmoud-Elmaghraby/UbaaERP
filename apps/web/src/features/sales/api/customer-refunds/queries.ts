import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateCustomerRefundDto, CustomerRefundDto, MoneyDto } from '@erp-platform/contracts';

import { apiGet, apiPost } from '../../../../lib/api-client';

/** رد مبلغ لعميل (migration 0113) — money paid back to a customer out of a treasury. */
export function useCustomerRefunds(customerId: string | undefined) {
  return useQuery({
    queryKey: ['customer-refunds', 'list', customerId],
    queryFn: () => apiGet<CustomerRefundDto[]>(`/customer-refunds?customerId=${customerId}`),
    enabled: Boolean(customerId),
  });
}

/** The credit a customer holds in a currency — the most that can be refunded. */
export function useCustomerRefundableCredit(customerId: string | undefined, currency: string | undefined) {
  return useQuery({
    queryKey: ['customer-refunds', 'available', customerId, currency],
    queryFn: () =>
      apiGet<MoneyDto>(`/customer-refunds/available?customerId=${customerId}&currency=${encodeURIComponent(currency ?? '')}`),
    enabled: Boolean(customerId && currency),
  });
}

function useInvalidateRefunds() {
  const queryClient = useQueryClient();
  return () => {
    for (const key of ['customer-refunds', 'customers', 'party-statement', 'party-balances', 'treasury']) {
      queryClient.invalidateQueries({ queryKey: [key] });
    }
  };
}

export function useCreateCustomerRefund() {
  const invalidate = useInvalidateRefunds();
  return useMutation({
    mutationFn: (input: CreateCustomerRefundDto) => apiPost<CustomerRefundDto>('/customer-refunds', input),
    onSuccess: invalidate,
  });
}

export function useCancelCustomerRefund() {
  const invalidate = useInvalidateRefunds();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      apiPost<CustomerRefundDto>(`/customer-refunds/${id}/cancel`, { reason }),
    onSuccess: invalidate,
  });
}

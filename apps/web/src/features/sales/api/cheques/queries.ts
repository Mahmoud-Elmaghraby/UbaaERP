import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ChequeDateDto, CollectChequeDto, IssuedChequeDto, ReceivedChequeDto } from '@erp-platform/contracts';

import { apiGet, apiPost } from '../../../../lib/api-client';

export type ReceivedChequeStatus = ReceivedChequeDto['status'];
export type IssuedChequeStatus = IssuedChequeDto['status'];

const RECEIVED_KEY = ['cheques', 'received'];
const ISSUED_KEY = ['cheques', 'issued'];

/** أوراق القبض — customer cheques (?status=&customerId=). */
export function useReceivedCheques(filters: { status?: ReceivedChequeStatus; customerId?: string } = {}, enabled = true) {
  return useQuery({
    queryKey: [...RECEIVED_KEY, filters],
    queryFn: () => {
      const query = new URLSearchParams();
      if (filters.status) query.set('status', filters.status);
      if (filters.customerId) query.set('customerId', filters.customerId);
      const qs = query.toString();
      return apiGet<ReceivedChequeDto[]>(`/cheques/received${qs ? `?${qs}` : ''}`);
    },
    enabled,
  });
}

/** أوراق الدفع — our own cheques given to suppliers (?status=). */
export function useIssuedCheques(filters: { status?: IssuedChequeStatus } = {}, enabled = true) {
  return useQuery({
    queryKey: [...ISSUED_KEY, filters],
    queryFn: () =>
      apiGet<IssuedChequeDto[]>(`/supplier-payments/cheques${filters.status ? `?status=${filters.status}` : ''}`),
    enabled,
  });
}

/** Everything a cheque action can change: the cheques lists, the receipt / payment, invoices' paid amounts, statements and treasury balances. */
function useInvalidateAfterChequeAction() {
  const queryClient = useQueryClient();
  return () => {
    for (const key of [
      ['cheques'],
      ['payments-received'],
      ['sales-invoices'],
      ['supplier-payments'],
      ['treasury'],
      ['customers'],
      ['party-statement'],
      ['party-balances'],
    ]) {
      void queryClient.invalidateQueries({ queryKey: key });
    }
  };
}

/** Deposited and paid: the money lands in the chosen bank treasury. */
export function useCollectCheque() {
  const invalidate = useInvalidateAfterChequeAction();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: CollectChequeDto }) =>
      apiPost<void>(`/cheques/received/${id}/collect`, input),
    onSuccess: () => invalidate(),
  });
}

/** Returned unpaid: the receipt stops counting and the customer owes the amount again. */
export function useBounceCheque() {
  const invalidate = useInvalidateAfterChequeAction();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: ChequeDateDto }) =>
      apiPost<void>(`/cheques/received/${id}/bounce`, input),
    onSuccess: () => invalidate(),
  });
}

/** Our cheque was paid by the bank (صرف): the bank balance goes down. */
export function useClearIssuedCheque() {
  const invalidate = useInvalidateAfterChequeAction();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: ChequeDateDto }) =>
      apiPost<void>(`/supplier-payments/${id}/clear-cheque`, input),
    onSuccess: () => invalidate(),
  });
}

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  BankAccountDto,
  BankAccountRegisterDto,
  BankAccountRegisterLineDto,
  CreateBankAccountDto,
  UpdateBankAccountDto,
} from '@erp-platform/contracts';

import { apiDelete, apiGet, apiPatch, apiPost } from '../../../../lib/api-client';

const LIST_KEY = ['bank-accounts'];

export function useBankAccounts() {
  return useQuery({ queryKey: LIST_KEY, queryFn: () => apiGet<BankAccountDto[]>('/bank-accounts') });
}

export function useBankAccount(id: string | null | undefined) {
  return useQuery({
    queryKey: ['bank-accounts', id],
    queryFn: () => apiGet<BankAccountDto>(`/bank-accounts/${id}`),
    enabled: Boolean(id),
  });
}

/** GET /bank-accounts/:id/register?fromDate=&toDate= — only fires once both the bank
 * account id is known and the caller has actually asked to run it (see
 * BankAccountRegisterView's own "Run" button, same not-on-every-keystroke pattern as
 * the four AccountingReportsService reports). */
export function useBankAccountRegister(
  id: string | null | undefined,
  params: { fromDate?: string; toDate?: string } | null,
) {
  return useQuery({
    queryKey: ['bank-accounts', id, 'register', params?.fromDate, params?.toDate],
    queryFn: () => {
      const query = new URLSearchParams();
      if (params?.fromDate) query.set('fromDate', params.fromDate);
      if (params?.toDate) query.set('toDate', params.toDate);
      const qs = query.toString();
      return apiGet<BankAccountRegisterDto>(`/bank-accounts/${id}/register${qs ? `?${qs}` : ''}`);
    },
    enabled: Boolean(id) && params !== null,
  });
}

export function useCreateBankAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateBankAccountDto) => apiPost<BankAccountDto>('/bank-accounts', input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: LIST_KEY }),
  });
}

export function useUpdateBankAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateBankAccountDto }) =>
      apiPatch<BankAccountDto>(`/bank-accounts/${id}`, input),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: LIST_KEY });
      queryClient.invalidateQueries({ queryKey: ['bank-accounts', data.id] });
    },
  });
}

export function useDeleteBankAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete<void>(`/bank-accounts/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: LIST_KEY }),
  });
}

function useReconcileTransition(action: 'reconcile' | 'unreconcile') {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ bankAccountId, lineId }: { bankAccountId: string; lineId: string }) =>
      apiPost<BankAccountRegisterLineDto>(`/bank-accounts/${bankAccountId}/lines/${lineId}/${action}`),
    // The register view re-fetches wholesale rather than patching one line in place —
    // simplest correct option since the running balance of every later line is
    // unaffected by a reconcile toggle (only isReconciled changes), but re-deriving
    // that here would duplicate BankAccountsService's own signing logic client-side.
    onSuccess: (_data, variables) =>
      queryClient.invalidateQueries({ queryKey: ['bank-accounts', variables.bankAccountId, 'register'] }),
  });
}

export function useReconcileLine() {
  return useReconcileTransition('reconcile');
}

export function useUnreconcileLine() {
  return useReconcileTransition('unreconcile');
}

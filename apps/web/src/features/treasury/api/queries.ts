import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CancelTreasuryVoucherDto,
  CreateTreasuryCategoryDto,
  CreateTreasuryDto,
  CreateTreasuryVoucherDto,
  TreasuryCategoryDto,
  TreasuryCategoryKindDto,
  TreasuryDto,
  TreasuryLookupDto,
  TreasuryStatementDto,
  TreasuryVoucherDto,
  TreasuryVoucherKindDto,
  UpdateTreasuryCategoryDto,
  UpdateTreasuryDto,
} from '@erp-platform/contracts';

import { apiDelete, apiGet, apiPatch, apiPost } from '../../../lib/api-client';

function query(params: Record<string, string | undefined>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) q.set(k, v);
  const text = q.toString();
  return text ? `?${text}` : '';
}

/** Everything that changes a balance invalidates the whole treasury cache. */
function useInvalidateTreasury() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ['treasury'] });
}

export function useTreasuries() {
  return useQuery({ queryKey: ['treasury', 'list'], queryFn: () => apiGet<TreasuryDto[]>('/treasuries') });
}

/** Active treasuries for pickers (receipts, payments, vouchers, POS). */
export function useTreasuryLookup() {
  return useQuery({ queryKey: ['treasury', 'lookup'], queryFn: () => apiGet<TreasuryLookupDto[]>('/treasuries/lookup'), staleTime: 60_000 });
}

export function useTreasury(id: string | undefined) {
  return useQuery({ queryKey: ['treasury', 'one', id], queryFn: () => apiGet<TreasuryDto>(`/treasuries/${id}`), enabled: Boolean(id) });
}

export function useTreasuryStatement(id: string | undefined, params: { from?: string; to?: string }) {
  return useQuery({
    queryKey: ['treasury', 'statement', id, params],
    queryFn: () => apiGet<TreasuryStatementDto>(`/treasuries/${id}/statement${query(params)}`),
    enabled: Boolean(id),
  });
}

export function useSaveTreasury() {
  const invalidate = useInvalidateTreasury();
  return useMutation({
    mutationFn: ({ id, input }: { id?: string; input: CreateTreasuryDto | UpdateTreasuryDto }) =>
      id ? apiPatch<TreasuryDto>(`/treasuries/${id}`, input) : apiPost<TreasuryDto>('/treasuries', input),
    onSuccess: invalidate,
  });
}

export function useDeleteTreasury() {
  const invalidate = useInvalidateTreasury();
  return useMutation({ mutationFn: (id: string) => apiDelete<void>(`/treasuries/${id}`), onSuccess: invalidate });
}

export function useTreasuryCategories(kind?: TreasuryCategoryKindDto) {
  return useQuery({
    queryKey: ['treasury', 'categories', kind],
    queryFn: () => apiGet<TreasuryCategoryDto[]>(`/treasury-categories${query({ kind })}`),
  });
}

export function useSaveTreasuryCategory() {
  const invalidate = useInvalidateTreasury();
  return useMutation({
    mutationFn: ({ id, input }: { id?: string; input: CreateTreasuryCategoryDto | UpdateTreasuryCategoryDto }) =>
      id
        ? apiPatch<TreasuryCategoryDto>(`/treasury-categories/${id}`, input)
        : apiPost<TreasuryCategoryDto>('/treasury-categories', input),
    onSuccess: invalidate,
  });
}

export function useDeleteTreasuryCategory() {
  const invalidate = useInvalidateTreasury();
  return useMutation({ mutationFn: (id: string) => apiDelete<void>(`/treasury-categories/${id}`), onSuccess: invalidate });
}

export function useTreasuryVouchers(params: { kind?: TreasuryVoucherKindDto; treasuryId?: string; from?: string; to?: string }) {
  return useQuery({
    queryKey: ['treasury', 'vouchers', params],
    queryFn: () => apiGet<TreasuryVoucherDto[]>(`/treasury-vouchers${query(params)}`),
  });
}

export function useCreateTreasuryVoucher() {
  const invalidate = useInvalidateTreasury();
  return useMutation({
    mutationFn: (input: CreateTreasuryVoucherDto) => apiPost<TreasuryVoucherDto>('/treasury-vouchers', input),
    onSuccess: invalidate,
  });
}

export function useCancelTreasuryVoucher() {
  const invalidate = useInvalidateTreasury();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: CancelTreasuryVoucherDto }) =>
      apiPost<TreasuryVoucherDto>(`/treasury-vouchers/${id}/cancel`, input),
    onSuccess: invalidate,
  });
}

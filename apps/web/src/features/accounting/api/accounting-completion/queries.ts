import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  BankStatementLineDto,
  BookBankStatementLineDto,
  BudgetDto,
  BudgetVsActualDto,
  DepreciationRunResultDto,
  DisposeFixedAssetDto,
  FixedAssetDepreciationDto,
  FixedAssetDto,
  ImportBankStatementDto,
  RecurringEntryDto,
  SaveBudgetDto,
  SaveFixedAssetDto,
  SaveRecurringEntryDto,
} from '@erp-platform/contracts';

import { apiDelete, apiGet, apiPatch, apiPost } from '../../../../lib/api-client';

/** Entries made by these jobs show up in the journal and every report. */
function invalidateLedger(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: ['journal-entries'] });
  void queryClient.invalidateQueries({ queryKey: ['accounting-reports'] });
  void queryClient.invalidateQueries({ queryKey: ['bank-accounts'] });
}

// ── Recurring entries ──────────────────────────────────────────────────
const RECURRING = ['recurring-entries'];

export function useRecurringEntries() {
  return useQuery({ queryKey: RECURRING, queryFn: () => apiGet<RecurringEntryDto[]>('/recurring-entries') });
}

export function useSaveRecurringEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string | null; input: SaveRecurringEntryDto }) =>
      id ? apiPatch<RecurringEntryDto>(`/recurring-entries/${id}`, input) : apiPost<RecurringEntryDto>('/recurring-entries', input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: RECURRING }),
  });
}

export function useDeleteRecurringEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete<void>(`/recurring-entries/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: RECURRING }),
  });
}

export function useGenerateRecurringEntries() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiPost<{ made: number }>('/recurring-entries/generate'),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: RECURRING });
      invalidateLedger(queryClient);
    },
  });
}

// ── Fixed assets ───────────────────────────────────────────────────────
const ASSETS = ['fixed-assets'];
export type FixedAssetDetail = FixedAssetDto & { depreciations: FixedAssetDepreciationDto[] };

export function useFixedAssets() {
  return useQuery({ queryKey: ASSETS, queryFn: () => apiGet<FixedAssetDto[]>('/fixed-assets') });
}

export function useFixedAsset(id: string | undefined) {
  return useQuery({
    queryKey: [...ASSETS, id],
    queryFn: () => apiGet<FixedAssetDetail>(`/fixed-assets/${id}`),
    enabled: Boolean(id),
  });
}

export function useSaveFixedAsset() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string | null; input: SaveFixedAssetDto }) =>
      id ? apiPatch<FixedAssetDto>(`/fixed-assets/${id}`, input) : apiPost<FixedAssetDto>('/fixed-assets', input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ASSETS }),
  });
}

export function useDeleteFixedAsset() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete<void>(`/fixed-assets/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ASSETS }),
  });
}

export function useRunDepreciation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (through?: string) => apiPost<DepreciationRunResultDto>('/fixed-assets/depreciation/run', through ? { through } : {}),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ASSETS });
      invalidateLedger(queryClient);
    },
  });
}

export function useDisposeFixedAsset() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: DisposeFixedAssetDto }) => apiPost<FixedAssetDto>(`/fixed-assets/${id}/dispose`, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ASSETS });
      invalidateLedger(queryClient);
    },
  });
}

// ── Budgets ────────────────────────────────────────────────────────────
const BUDGETS = ['budgets'];
export type BudgetSummary = Omit<BudgetDto, 'lines'>;

export function useBudgets() {
  return useQuery({ queryKey: BUDGETS, queryFn: () => apiGet<BudgetSummary[]>('/budgets') });
}

export function useBudget(id: string | undefined) {
  return useQuery({ queryKey: [...BUDGETS, id], queryFn: () => apiGet<BudgetDto>(`/budgets/${id}`), enabled: Boolean(id) });
}

export function useBudgetVsActual(id: string | undefined, toDate: string | undefined) {
  return useQuery({
    queryKey: [...BUDGETS, id, 'vs-actual', toDate],
    queryFn: () => apiGet<BudgetVsActualDto>(`/budgets/${id}/vs-actual${toDate ? `?toDate=${toDate}` : ''}`),
    enabled: Boolean(id),
  });
}

export function useSaveBudget() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string | null; input: SaveBudgetDto }) =>
      id ? apiPatch<BudgetDto>(`/budgets/${id}`, input) : apiPost<BudgetDto>('/budgets', input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: BUDGETS }),
  });
}

export function useDeleteBudget() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete<void>(`/budgets/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: BUDGETS }),
  });
}

// ── Bank statement ─────────────────────────────────────────────────────
function statementKey(bankAccountId: string | undefined) {
  return ['bank-accounts', bankAccountId, 'statement'];
}

export function useBankStatement(bankAccountId: string | undefined, range: { fromDate?: string; toDate?: string }) {
  return useQuery({
    queryKey: [...statementKey(bankAccountId), range.fromDate, range.toDate],
    queryFn: () => {
      const query = new URLSearchParams();
      if (range.fromDate) query.set('fromDate', range.fromDate);
      if (range.toDate) query.set('toDate', range.toDate);
      const qs = query.toString();
      return apiGet<BankStatementLineDto[]>(`/bank-accounts/${bankAccountId}/statement${qs ? `?${qs}` : ''}`);
    },
    enabled: Boolean(bankAccountId),
  });
}

/** Every statement action changes reconciliation ticks too, so the whole bank account is refetched. */
function useStatementMutation<TVars, TResult>(fn: (vars: TVars) => Promise<TResult>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => invalidateLedger(queryClient),
  });
}

export function useImportBankStatement(bankAccountId: string | undefined) {
  return useStatementMutation((input: ImportBankStatementDto) =>
    apiPost<{ imported: number; matched: number }>(`/bank-accounts/${bankAccountId}/statement/import`, input),
  );
}

export function useStatementLineAction(bankAccountId: string | undefined) {
  return useStatementMutation(
    ({ lineId, action, journalLineId }: { lineId: string; action: 'match' | 'unmatch' | 'ignore' | 'restore' | 'delete'; journalLineId?: string }) => {
      const base = `/bank-accounts/${bankAccountId}/statement/lines/${lineId}`;
      if (action === 'delete') return apiDelete<void>(base);
      return apiPost<void>(`${base}/${action}`, action === 'match' ? { journalLineId } : undefined);
    },
  );
}

export function useBookStatementLine(bankAccountId: string | undefined) {
  return useStatementMutation(({ lineId, input }: { lineId: string; input: BookBankStatementLineDto }) =>
    apiPost<void>(`/bank-accounts/${bankAccountId}/statement/lines/${lineId}/book`, input),
  );
}

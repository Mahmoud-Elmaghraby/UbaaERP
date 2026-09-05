import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateJournalEntryDto,
  JournalEntryDto,
  JournalEntryStatus,
  JournalEntryWithLinesDto,
  ReverseJournalEntryDto,
  UpdateJournalEntryDto,
} from '@erp-platform/contracts';

import { apiDelete, apiGet, apiPatch, apiPost } from '../../../../lib/api-client';

export interface JournalEntryFilters {
  status?: JournalEntryStatus;
  fromDate?: string;
  toDate?: string;
}

const LIST_KEY = ['journal-entries'];

function buildQuery(filters: JournalEntryFilters): string {
  const params = new URLSearchParams();
  if (filters.status) params.set('status', filters.status);
  if (filters.fromDate) params.set('fromDate', filters.fromDate);
  if (filters.toDate) params.set('toDate', filters.toDate);
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

export function useJournalEntries(filters: JournalEntryFilters = {}) {
  return useQuery({
    queryKey: [...LIST_KEY, filters],
    queryFn: () => apiGet<JournalEntryDto[]>(`/journal-entries${buildQuery(filters)}`),
  });
}

export function useJournalEntry(id: string | null | undefined) {
  return useQuery({
    queryKey: ['journal-entries', id],
    queryFn: () => apiGet<JournalEntryWithLinesDto>(`/journal-entries/${id}`),
    enabled: Boolean(id),
  });
}

export function useCreateJournalEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateJournalEntryDto) =>
      apiPost<JournalEntryWithLinesDto>('/journal-entries', input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: LIST_KEY }),
  });
}

export function useUpdateJournalEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateJournalEntryDto }) =>
      apiPatch<JournalEntryWithLinesDto>(`/journal-entries/${id}`, input),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: LIST_KEY });
      queryClient.invalidateQueries({ queryKey: ['journal-entries', data.id] });
    },
  });
}

export function usePostJournalEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiPost<JournalEntryWithLinesDto>(`/journal-entries/${id}/post`),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: LIST_KEY });
      queryClient.invalidateQueries({ queryKey: ['journal-entries', data.id] });
    },
  });
}

export function useCancelJournalEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiPost<JournalEntryDto>(`/journal-entries/${id}/cancel`),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: LIST_KEY });
      queryClient.invalidateQueries({ queryKey: ['journal-entries', data.id] });
    },
  });
}

/** reverse() creates a brand-new draft entry with every line's debit/credit swapped
 * (JournalEntriesService.reverse()) — not a status change on the original entry, so
 * this also invalidates the whole list (a new row appears), not just the source
 * entry's own detail query. */
export function useReverseJournalEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: ReverseJournalEntryDto }) =>
      apiPost<JournalEntryWithLinesDto>(`/journal-entries/${id}/reverse`, input),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: LIST_KEY });
      queryClient.invalidateQueries({ queryKey: ['journal-entries', variables.id] });
    },
  });
}

/** Only a draft entry can be deleted (JournalEntriesService.delete() — a posted entry
 * is a ledger-worthy fact, reversed rather than deleted, same rationale as Purchase
 * Invoices' post()). */
export function useDeleteJournalEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete<void>(`/journal-entries/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: LIST_KEY }),
  });
}

import { useQuery } from '@tanstack/react-query';
import type { PurchaseDebitNoteDto, PurchaseDebitNoteWithLinesDto } from '@erp-platform/contracts';

import { apiGet } from '../../../../lib/api-client';

const LIST_KEY = ['purchase-debit-notes'] as const;

/** Debit notes are issued by confirming a purchase return — read-only here. */
export function usePurchaseDebitNotes(filter: { supplierId?: string; purchaseReturnId?: string } = {}, enabled = true) {
  const params = new URLSearchParams();
  if (filter.supplierId) params.set('supplierId', filter.supplierId);
  if (filter.purchaseReturnId) params.set('purchaseReturnId', filter.purchaseReturnId);
  const query = params.toString();
  return useQuery({
    queryKey: [...LIST_KEY, filter],
    queryFn: () => apiGet<PurchaseDebitNoteDto[]>(`/purchase-debit-notes${query ? `?${query}` : ''}`),
    enabled,
  });
}

export function usePurchaseDebitNote(id: string | null | undefined) {
  return useQuery({
    queryKey: [...LIST_KEY, 'detail', id],
    queryFn: () => apiGet<PurchaseDebitNoteWithLinesDto>(`/purchase-debit-notes/${id}`),
    enabled: Boolean(id),
  });
}

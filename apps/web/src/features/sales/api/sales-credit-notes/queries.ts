import { useQuery } from '@tanstack/react-query';
import type { SalesCreditNoteDto, SalesCreditNoteWithLinesDto } from '@erp-platform/contracts';

import { apiGet } from '../../../../lib/api-client';

const LIST_KEY = ['sales-credit-notes'];

/**
 * Read-only, matching the backend: SalesCreditNotesController has no
 * @Post/@Patch/@Delete at all (see migration 0053's class comment and
 * SalesReturnsService.confirm(), which is the only place a credit note is
 * ever created). Unscoped list — GET /sales-credit-notes has no required
 * filter, so this gets its own routed page with a plain master list, same
 * shape as Purchase Returns / Goods Receipts.
 */
export function useSalesCreditNotes() {
  return useQuery({
    queryKey: LIST_KEY,
    queryFn: () => apiGet<SalesCreditNoteDto[]>('/sales-credit-notes'),
  });
}

/** Scoped list (?salesReturnId=) — the credit note is 1:1 with the sales return that
 * generated it (unique FK on the backend), used by SalesReturnDetailsView to link to
 * the resulting credit note once a return is confirmed. */
export function useSalesCreditNotesBySalesReturn(salesReturnId: string | null | undefined) {
  return useQuery({
    queryKey: ['sales-credit-notes', 'by-sales-return', salesReturnId],
    queryFn: () => apiGet<SalesCreditNoteDto[]>(`/sales-credit-notes?salesReturnId=${salesReturnId}`),
    enabled: Boolean(salesReturnId),
  });
}

export function useSalesCreditNote(id: string | null | undefined) {
  return useQuery({
    queryKey: ['sales-credit-notes', id],
    queryFn: () => apiGet<SalesCreditNoteWithLinesDto>(`/sales-credit-notes/${id}`),
    enabled: Boolean(id),
  });
}

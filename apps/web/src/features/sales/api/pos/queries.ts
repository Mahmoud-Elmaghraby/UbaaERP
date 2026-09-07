import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ClosePosSessionDto,
  OpenPosSessionDto,
  PosCheckoutDto,
  PosCheckoutResultDto,
  PosSessionDto,
  PosSessionReportDto,
} from '@erp-platform/contracts';

import { apiGet, apiPost } from '../../../../lib/api-client';

const CURRENT_KEY = ['pos-sessions', 'current'];

/**
 * POS feature Stage 4 (claude/sales-pos-research.md). Deliberately thin: the POS
 * screen only ever needs the *current* cashier's own open session (or null), never
 * the full sessions list — PosSessionsController.getCurrentOpen() already resolves
 * "current session" server-side from the JWT, so there's no cashierUserId param here.
 */
export function useCurrentPosSession() {
  return useQuery({
    queryKey: CURRENT_KEY,
    queryFn: () => apiGet<PosSessionDto | null>('/pos-sessions/current'),
  });
}

export function useOpenPosSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: OpenPosSessionDto) => apiPost<PosSessionDto>('/pos-sessions', input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: CURRENT_KEY }),
  });
}

export function useClosePosSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: ClosePosSessionDto }) =>
      apiPost<PosSessionDto>(`/pos-sessions/${id}/close`, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: CURRENT_KEY }),
  });
}

/**
 * On success, invalidates every entity checkout() touches server-side in one
 * transaction (sales orders, deliveries, sales invoices, payments received) plus
 * the current session itself (its expected/counted cash figures are only computed
 * at close time, but invalidating it anyway costs nothing and keeps this in sync
 * with any future field that does change on checkout).
 */
/**
 * POS Stage 5 — X Report (open session) / Z Report (closed session), same
 * endpoint either way (see PosSessionReport's own backend comment). Not
 * invalidated by usePosCheckout()'s onSuccess below on purpose: it's a
 * read-only, on-demand snapshot the cashier opens deliberately (a "عرض
 * التقرير" button), not a figure shown continuously on the cart screen — a
 * stale cached copy sitting unused is harmless, and refetch() (exposed to the
 * report dialog) covers "show me the latest now".
 */
export function usePosSessionReport(sessionId: string | undefined) {
  return useQuery({
    queryKey: ['pos-sessions', sessionId, 'report'],
    queryFn: () => apiGet<PosSessionReportDto>(`/pos-sessions/${sessionId}/report`),
    enabled: Boolean(sessionId),
  });
}

export function usePosCheckout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ posSessionId, input }: { posSessionId: string; input: PosCheckoutDto }) =>
      apiPost<PosCheckoutResultDto>(`/pos-sessions/${posSessionId}/checkout`, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CURRENT_KEY });
      queryClient.invalidateQueries({ queryKey: ['sales-orders'] });
      queryClient.invalidateQueries({ queryKey: ['deliveries'] });
      queryClient.invalidateQueries({ queryKey: ['sales-invoices'] });
      queryClient.invalidateQueries({ queryKey: ['payments-received'] });
    },
  });
}

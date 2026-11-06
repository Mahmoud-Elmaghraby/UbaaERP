import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ClosePosSessionDto,
  HoldPosCartDto,
  OpenPosSessionDto,
  PosCashMovementDto,
  PosCashMovementRowDto,
  PosCheckoutDto,
  PosCheckoutResultDto,
  PosHeldCartDto,
  PosReturnDto,
  PosReturnResultDto,
  PosSaleForReturnDto,
  PosSaleSummaryDto,
  PosSessionDto,
  PosSessionReportDto,
} from '@erp-platform/contracts';

import { apiDelete, apiGet, apiPost } from '../../../../lib/api-client';

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
    // The current session is NOT invalidated here: the close dialog keeps showing
    // the Z figures and calls finishPosSessionClose() when the cashier dismisses it.
    onSuccess: (_closed, { id }) => queryClient.invalidateQueries({ queryKey: ['pos-sessions', id] }),
  });
}

/** After a close: drop the till back to "open a session". */
export function useFinishPosSessionClose() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: CURRENT_KEY });
}

/**
 * POS Stage 5 — X Report (open session) / Z Report (closed session), same
 * endpoint either way. Lives under ['pos-sessions', id] so every till action
 * (checkout, return, drawer movement) refreshes it.
 */
export function usePosSessionReport(sessionId: string | undefined) {
  return useQuery({
    queryKey: ['pos-sessions', sessionId, 'report'],
    queryFn: () => apiGet<PosSessionReportDto>(`/pos-sessions/${sessionId}/report`),
    enabled: Boolean(sessionId),
  });
}

/**
 * On success, invalidates every entity checkout() touches server-side in one
 * transaction (sales orders, deliveries, sales invoices, payments received) plus
 * the current session itself (its expected/counted cash figures are only computed
 * at close time, but invalidating it anyway costs nothing and keeps this in sync
 * with any future field that does change on checkout).
 */
export function usePosCheckout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ posSessionId, input }: { posSessionId: string; input: PosCheckoutDto }) =>
      apiPost<PosCheckoutResultDto>(`/pos-sessions/${posSessionId}/checkout`, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pos-sessions'] });
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      queryClient.invalidateQueries({ queryKey: ['sales-orders'] });
      queryClient.invalidateQueries({ queryKey: ['deliveries'] });
      queryClient.invalidateQueries({ queryKey: ['sales-invoices'] });
      queryClient.invalidateQueries({ queryKey: ['payments-received'] });
      queryClient.invalidateQueries({ queryKey: ['party-statement'] });
      queryClient.invalidateQueries({ queryKey: ['treasury'] });
    },
  });
}

// ---- The till beyond checkout (migration 0113) ----

const sessionKey = (sessionId: string, part: string) => ['pos-sessions', sessionId, part];

/** The shift's posted sales (receipts). */
export function usePosSessionSales(sessionId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: sessionKey(sessionId ?? '', 'sales'),
    queryFn: () => apiGet<PosSaleSummaryDto[]>(`/pos/sessions/${sessionId}/sales`),
    enabled: Boolean(sessionId) && enabled,
  });
}

/** A sale by its invoice number, with what can still be returned. */
export function fetchPosSaleForReturn(invoiceNumber: string) {
  return apiGet<PosSaleForReturnDto>(`/pos/sales/lookup?number=${encodeURIComponent(invoiceNumber.trim())}`);
}

export function usePosReturn() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ sessionId, input }: { sessionId: string; input: PosReturnDto }) =>
      apiPost<PosReturnResultDto>(`/pos/sessions/${sessionId}/returns`, input),
    onSuccess: () => {
      for (const key of [
        'pos-sessions',
        'sales-invoices',
        'sales-returns',
        'sales-credit-notes',
        'deliveries',
        'customers',
        'customer-refunds',
        'party-statement',
        'party-balances',
        'treasury',
      ]) {
        queryClient.invalidateQueries({ queryKey: [key] });
      }
    },
  });
}

export function usePosHeldCarts(sessionId: string) {
  return useQuery({
    queryKey: sessionKey(sessionId, 'held-carts'),
    queryFn: () => apiGet<PosHeldCartDto[]>(`/pos/sessions/${sessionId}/held-carts`),
  });
}

export function useHoldPosCart(sessionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: HoldPosCartDto) => apiPost<PosHeldCartDto>(`/pos/sessions/${sessionId}/held-carts`, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: sessionKey(sessionId, 'held-carts') }),
  });
}

/** Resume (after loading it) or discard a parked sale — a 404 means another till already took it. */
export function useTakePosHeldCart(sessionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (cartId: string) => apiDelete<void>(`/pos/held-carts/${cartId}`),
    onSettled: () => queryClient.invalidateQueries({ queryKey: sessionKey(sessionId, 'held-carts') }),
  });
}

export function usePosDrawerMovements(sessionId: string, enabled = true) {
  return useQuery({
    queryKey: ['pos-drawer', sessionId, 'movements'],
    queryFn: () => apiGet<PosCashMovementRowDto[]>(`/pos-drawer/${sessionId}/movements`),
    enabled,
  });
}

export interface PosDrawerOptions {
  categories: Array<{ id: string; name: string }>;
  treasuries: Array<{ id: string; name: string; kind: string }>;
}

export function usePosDrawerOptions(sessionId: string, enabled = true) {
  return useQuery({
    queryKey: ['pos-drawer', sessionId, 'options'],
    queryFn: () => apiGet<PosDrawerOptions>(`/pos-drawer/${sessionId}/options`),
    enabled,
    staleTime: 60_000,
  });
}

export function usePosCashMovement(sessionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: PosCashMovementDto) => apiPost<PosCashMovementRowDto>(`/pos-drawer/${sessionId}/movements`, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pos-drawer', sessionId] });
      queryClient.invalidateQueries({ queryKey: ['pos-sessions', sessionId] });
      queryClient.invalidateQueries({ queryKey: ['treasury'] });
    },
  });
}

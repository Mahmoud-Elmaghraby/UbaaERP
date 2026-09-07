import type { Money } from '@erp-platform/shared-kernel';

/**
 * POS Cash Session (CLAUDE.md §10 — step 4, Sales — POS feature, Stage
 * 1). See claude/sales-pos-research.md for the full design and
 * migration 0059's comment for the storage/uniqueness reasoning.
 *
 * expectedCashAmount/countedCashAmount/varianceAmount are null while
 * `status === 'open'` — they only exist once PosSessionsService.close()
 * has run, and are stored (not derived) from that point on.
 *
 * warehouseId (Stage 3, migration 0064): the warehouse every checkout
 * during this session delivers stock from, resolved once at open time —
 * see that migration's comment for why (explicit user decision, not
 * per-checkout and not derived from user_branch_access).
 */
export type PosSessionStatus = 'open' | 'closed';

export interface PosSession {
  id: string;
  cashierUserId: string;
  status: PosSessionStatus;
  openingCashAmount: Money;
  warehouseId: string | null;
  expectedCashAmount: Money | null;
  countedCashAmount: Money | null;
  varianceAmount: Money | null;
  notes: string | null;
  openedAt: Date;
  closedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface OpenPosSessionInput {
  cashierUserId: string;
  openingCashAmount: Money;
  warehouseId: string;
  notes?: string | null;
}

export interface ClosePosSessionInput {
  countedCashAmount: Money;
  notes?: string | null;
}

export interface PosSessionFilters {
  status?: PosSessionStatus;
  cashierUserId?: string;
}

/**
 * POS Stage 5 (claude/sales-pos-research.md) — X Report (session still 'open') and Z
 * Report (session 'closed') are the SAME computation, returned by the SAME endpoint
 * (`GET /pos-sessions/:id/report`) and the same shape — exactly like `PosSession`
 * itself already models expected/counted/varianceAmount as null-until-closed rather
 * than as two separate types. What differs is only which figures are live-computed
 * vs already-stored:
 *
 * - Open session (X report): expectedCashAmount is computed live (opening float +
 *   cash tenders so far, the same formula PosSessionsService.close() uses before it
 *   stores anything) — countedCashAmount/varianceAmount are null (nothing counted yet).
 * - Closed session (Z report): expectedCashAmount/countedCashAmount/varianceAmount are
 *   read back from the session's own stored, immutable closing figures (never
 *   recomputed) — same "a closed period's numbers are a historical fact" discipline
 *   as `pos_sessions` itself (migration 0059's comment) and fiscal_years/accounting_periods.
 *
 * salesCount/totalSalesAmount and tendersByMethod are derived entirely from existing
 * data — no new column or migration needed. Every POS checkout() call fully allocates
 * every one of its tenders to the single Sales Invoice it creates (Stage 3), and every
 * one of those payments_received rows is tagged with this session's id
 * (`pos_session_id`, migration 0060) — so a session's sales figures are reachable via
 * that existing FK plus `payment_allocations`, without touching `sales_orders` or
 * `sales_invoices` at all. Deliberately out of scope for v1: gross sales before
 * discount / total discounts given — that would need a much larger change (there is
 * no `pos_session_id` on `sales_orders`, and an invoice's own subtotal is
 * server-computed from its order, not stored) for a figure nobody has asked for yet.
 */
export interface PosSessionTenderTotal {
  paymentMethod: string;
  amount: Money;
}

export interface PosSessionReport {
  session: PosSession;
  salesCount: number;
  totalSalesAmount: Money;
  tendersByMethod: PosSessionTenderTotal[];
  /** Live for an open session, stored (immutable) for a closed one — see this file's own comment above. */
  expectedCashAmount: Money;
  /** Only non-null once the session is closed. */
  countedCashAmount: Money | null;
  /** Only non-null once the session is closed. */
  varianceAmount: Money | null;
  generatedAt: Date;
}

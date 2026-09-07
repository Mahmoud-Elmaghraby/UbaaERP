import type { Kysely } from 'kysely';
import type { Money } from '@erp-platform/shared-kernel';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import type { OpenPosSessionInput, PosSession, PosSessionFilters } from '../../domain/pos-session.entity';

export interface ClosePosSessionFields {
  expectedCashAmount: Money;
  countedCashAmount: Money;
  varianceAmount: Money;
  notes: string | null;
  closedAt: Date;
}

export interface PosSessionRepository {
  list(db: Kysely<TenantDatabase>, filters?: PosSessionFilters): Promise<PosSession[]>;
  findById(db: Kysely<TenantDatabase>, id: string): Promise<PosSession | null>;
  /** At most one row can ever match (partial UNIQUE index, migration 0059) — null when this cashier has no open session. */
  findOpenByCashierId(db: Kysely<TenantDatabase>, cashierUserId: string): Promise<PosSession | null>;
  /**
   * Sum of 'cash' payment_method payments_received rows tagged with
   * this session's id (pos_session_id, migration 0060) — the "cash
   * tenders recorded during the session" half of expected_cash_amount.
   * Returns null when the session has no such payments yet (which, until
   * Stage 3's checkout orchestration exists, is always).
   */
  sumCashTendersForSession(db: Kysely<TenantDatabase>, sessionId: string): Promise<string | null>;
  /**
   * POS Stage 5 — one row per distinct `payment_method` value among this session's
   * posted `payments_received` rows, with the SUM of `amount_amount` for that method.
   * Methods with no tenders in this session simply don't appear (no zero-filled rows).
   */
  sumTendersByMethodForSession(
    db: Kysely<TenantDatabase>,
    sessionId: string,
  ): Promise<{ paymentMethod: string; totalMinorUnits: string }[]>;
  /**
   * POS Stage 5 — via `payment_allocations` joined to this session's posted
   * `payments_received` rows: `salesCount` is the number of DISTINCT sales invoices
   * referenced (never the number of payment rows — a single split-tender checkout
   * writes several payments for one sale), `totalMinorUnits` is the sum of their
   * allocated amounts (null when the session has no sales yet).
   */
  countAndSumSalesForSession(
    db: Kysely<TenantDatabase>,
    sessionId: string,
  ): Promise<{ salesCount: number; totalMinorUnits: string | null }>;
  create(db: Kysely<TenantDatabase>, input: OpenPosSessionInput): Promise<PosSession>;
  close(db: Kysely<TenantDatabase>, id: string, fields: ClosePosSessionFields): Promise<PosSession | null>;
}

export const POS_SESSION_REPOSITORY = Symbol('POS_SESSION_REPOSITORY');

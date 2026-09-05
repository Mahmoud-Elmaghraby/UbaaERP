import type { Money } from '@erp-platform/shared-kernel';

/**
 * POS Cash Session (CLAUDE.md §10 — step 4, Sales — POS feature, Stage
 * 1). See claude/sales-pos-research.md for the full design and
 * migration 0059's comment for the storage/uniqueness reasoning.
 *
 * expectedCashAmount/countedCashAmount/varianceAmount are null while
 * `status === 'open'` — they only exist once PosSessionsService.close()
 * has run, and are stored (not derived) from that point on.
 */
export type PosSessionStatus = 'open' | 'closed';

export interface PosSession {
  id: string;
  cashierUserId: string;
  status: PosSessionStatus;
  openingCashAmount: Money;
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

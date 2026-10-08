import { Global, Injectable, Module } from '@nestjs/common';
import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../database/tenant/kysely-client';

/**
 * Every movement of money in or out of a treasury, from whichever module
 * owns the document — the same registry pattern as central printing: Sales
 * contributes customer receipts (and POS cash differences), Purchases
 * contributes supplier payments, Treasury its own vouchers. The Treasury
 * module turns them into balances and statements without importing Sales or
 * Purchases (CLAUDE.md §2.6), and a new money-moving document only needs a
 * source here to appear in every treasury report.
 */
export type TreasuryMovementKind =
  | 'payment_received'
  | 'supplier_payment'
  | 'pos_variance'
  | 'expense'
  | 'income'
  | 'transfer_in'
  | 'transfer_out';

export interface TreasuryMovement {
  treasuryId: string;
  /** ISO date. */
  date: string;
  /** Signed minor units: + money in, − money out. */
  amountMinor: bigint;
  currency: string;
  kind: TreasuryMovementKind;
  documentId: string;
  number: string;
  /** Who paid / was paid, the other treasury of a transfer, the expense item… */
  counterparty: string | null;
  description: string | null;
  /** Tie-breaker within a date (creation time, ISO). */
  sequence: string;
}

export interface TreasuryMovementSource {
  /** Movements of one treasury, or of all treasuries when `treasuryId` is null. */
  listMovements(db: Kysely<TenantDatabase>, treasuryId: string | null): Promise<TreasuryMovement[]>;
}

@Injectable()
export class TreasuryMovementRegistry {
  private readonly sources: TreasuryMovementSource[] = [];

  register(...sources: TreasuryMovementSource[]): void {
    this.sources.push(...sources);
  }

  async list(db: Kysely<TenantDatabase>, treasuryId: string | null): Promise<TreasuryMovement[]> {
    const all = await Promise.all(this.sources.map((source) => source.listMovements(db, treasuryId)));
    return all.flat();
  }
}

@Global()
@Module({ providers: [TreasuryMovementRegistry], exports: [TreasuryMovementRegistry] })
export class TreasuryMovementsModule {}

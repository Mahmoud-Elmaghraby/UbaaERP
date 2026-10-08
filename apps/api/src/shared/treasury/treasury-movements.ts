import { Global, Injectable, Module } from '@nestjs/common';
import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../database/tenant/kysely-client';
import { BusinessRuleError } from '../errors/domain-errors';

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

  /**
   * A cash box or e-wallet can't pay out more than it holds (opening balance
   * + every movement). Banks are exempt (an overdraft is a real thing there).
   * Locks the treasury row, so two payments from the same box in parallel
   * can't both pass — call it inside the transaction that records the
   * outflow, BEFORE writing it.
   */
  async assertCanWithdraw(trx: Kysely<TenantDatabase>, treasuryId: string | null, amountMinor: bigint): Promise<void> {
    if (!treasuryId || amountMinor <= 0n) return;
    const row = await trx
      .selectFrom('treasuries')
      .select(['name', 'kind', 'currency', 'opening_balance_amount'])
      .where('id', '=', treasuryId)
      .forUpdate()
      .executeTakeFirst();
    if (!row || row.kind === 'bank') return;
    const movements = await this.list(trx, treasuryId);
    const balance = movements.reduce((sum, m) => sum + m.amountMinor, BigInt(row.opening_balance_amount));
    if (balance >= amountMinor) return;
    throw new BusinessRuleError(`Treasury "${row.name}" holds ${balance} and can't pay out ${amountMinor}.`, {
      code: 'TREASURY.INSUFFICIENT_BALANCE',
      params: { name: row.name, balance: formatMinor(balance), amount: formatMinor(amountMinor), currency: row.currency },
    });
  }
}

function formatMinor(value: bigint): string {
  const sign = value < 0n ? '-' : '';
  const abs = value < 0n ? -value : value;
  return `${sign}${abs / 100n}.${(abs % 100n).toString().padStart(2, '0')}`;
}

@Global()
@Module({ providers: [TreasuryMovementRegistry], exports: [TreasuryMovementRegistry] })
export class TreasuryMovementsModule {}

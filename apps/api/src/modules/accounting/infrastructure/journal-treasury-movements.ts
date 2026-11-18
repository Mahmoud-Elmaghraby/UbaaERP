import { Injectable, type OnModuleInit } from '@nestjs/common';
import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../../database/tenant/kysely-client';
import { TreasuryMovementRegistry, type TreasuryMovement, type TreasuryMovementSource } from '../../../shared/treasury/treasury-movements';

/**
 * Posted manual journal lines that name a treasury (migration 0132) move it like a voucher would:
 * a debit on the treasury's account is money in, a credit is money out.
 */
@Injectable()
export class JournalTreasuryMovements implements TreasuryMovementSource, OnModuleInit {
  constructor(private readonly registry: TreasuryMovementRegistry) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  async listMovements(db: Kysely<TenantDatabase>, treasuryId: string | null): Promise<TreasuryMovement[]> {
    let query = db
      .selectFrom('journal_entry_lines as l')
      .innerJoin('journal_entries as e', 'e.id', 'l.journal_entry_id')
      .select([
        'l.treasury_id', 'l.debit_amount', 'l.credit_amount', 'l.description', 'l.created_at',
        'e.id as entry_id', 'e.entry_number', 'e.entry_date', 'e.currency', 'e.description as entry_description',
      ])
      .where('e.status', '=', 'posted')
      .where('l.treasury_id', 'is not', null);
    if (treasuryId) query = query.where('l.treasury_id', '=', treasuryId);
    return (await query.execute()).map((row) => ({
      treasuryId: row.treasury_id as string,
      date: row.entry_date.slice(0, 10),
      amountMinor: BigInt(row.debit_amount) - BigInt(row.credit_amount),
      currency: row.currency,
      kind: 'journal_entry' as const,
      documentId: row.entry_id,
      number: row.entry_number,
      counterparty: null,
      description: row.description ?? row.entry_description,
      sequence: row.created_at.toISOString(),
    }));
  }
}

import { Injectable, type OnModuleInit } from '@nestjs/common';
import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../../database/tenant/kysely-client';
import { companyCurrency, LedgerCheckRegistry, type LedgerCheckRow, type LedgerCheckSource } from '../../../shared/integrity/ledger-checks';
import { TreasuriesService } from '../application/treasuries.service';

/** Each treasury's balance (opening + every movement) against the account its money sits in. */
@Injectable()
export class TreasuryLedgerChecks implements LedgerCheckSource, OnModuleInit {
  constructor(
    private readonly registry: LedgerCheckRegistry,
    private readonly treasuries: TreasuriesService,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  async listChecks(db: Kysely<TenantDatabase>): Promise<LedgerCheckRow[]> {
    const currency = await companyCurrency(db);
    const rows = await db.selectFrom('treasuries').select(['id', 'name', 'currency', 'opening_balance_amount']).orderBy('name').execute();
    const movements = await this.treasuries.balances(db);
    return rows.map((row) => {
      const foreign = row.currency !== currency;
      return {
        key: 'treasury' as const,
        account: { treasuryId: row.id },
        label: row.name,
        side: 'debit' as const,
        subledgerMinor: foreign ? 0n : BigInt(row.opening_balance_amount) + (movements.get(row.id) ?? 0n),
        foreignExcluded: foreign ? 1 : 0,
        includesJournalLines: true,
        lineColumn: 'treasury_id' as const,
        link: `/treasury/${row.id}`,
      };
    });
  }
}

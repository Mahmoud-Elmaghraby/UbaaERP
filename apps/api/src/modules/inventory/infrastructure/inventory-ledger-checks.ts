import { Injectable, type OnModuleInit } from '@nestjs/common';
import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../../database/tenant/kysely-client';
import { companyCurrency, LedgerCheckRegistry, type LedgerCheckRow, type LedgerCheckSource } from '../../../shared/integrity/ledger-checks';

/** The value of the stock on hand (every warehouse, in transit included) against the inventory account. */
@Injectable()
export class InventoryLedgerChecks implements LedgerCheckSource, OnModuleInit {
  constructor(private readonly registry: LedgerCheckRegistry) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  async listChecks(db: Kysely<TenantDatabase>): Promise<LedgerCheckRow[]> {
    const currency = await companyCurrency(db);
    const rows = await db
      .selectFrom('stock_levels')
      .select(['average_cost_currency', (eb) => eb.fn.sum<string>('inventory_value_amount').as('value'), (eb) => eb.fn.countAll<string>().as('count')])
      .groupBy('average_cost_currency')
      .execute();
    const own = rows.find((r) => r.average_cost_currency === currency);
    const foreign = rows.filter((r) => r.average_cost_currency !== currency && BigInt(r.value ?? '0') !== 0n);
    return [
      {
        key: 'inventory',
        account: { setting: 'inventoryAccountId' },
        side: 'debit',
        subledgerMinor: BigInt(own?.value ?? '0'),
        foreignExcluded: foreign.reduce((n, r) => n + Number(r.count), 0),
        includesJournalLines: true,
        lineColumn: null,
        link: '/inventory/valuation',
      },
    ];
  }
}

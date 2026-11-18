import { Injectable, type OnModuleInit } from '@nestjs/common';
import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import { companyCurrency, LedgerCheckRegistry, sumPartyEntries, type LedgerCheckRow, type LedgerCheckSource } from '../../../../shared/integrity/ledger-checks';
import { CustomerLedgerSource } from './customer-ledger.source';

/** Customer balances (→ Customers account) and cheques in hand (→ أوراق القبض) for the integrity check. */
@Injectable()
export class SalesLedgerChecks implements LedgerCheckSource, OnModuleInit {
  constructor(
    private readonly registry: LedgerCheckRegistry,
    private readonly customers: CustomerLedgerSource,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  async listChecks(db: Kysely<TenantDatabase>): Promise<LedgerCheckRow[]> {
    const currency = await companyCurrency(db);
    const balances = sumPartyEntries(await this.customers.listEntries(db, null), currency);
    const cheques = await db
      .selectFrom('payments_received')
      .select(['amount_amount', 'amount_currency'])
      .where('status', '=', 'posted')
      .where('payment_method', '=', 'check')
      .where('cheque_status', '=', 'in_hand')
      .execute();
    const inHand = cheques.filter((c) => c.amount_currency === currency).reduce((sum, c) => sum + BigInt(c.amount_amount), 0n);
    return [
      {
        key: 'customers',
        account: { setting: 'accountsReceivableAccountId' },
        side: 'debit',
        subledgerMinor: balances.totalMinor,
        foreignExcluded: balances.foreignExcluded,
        includesJournalLines: true,
        lineColumn: 'customer_id',
        link: '/sales/receivables',
      },
      {
        key: 'notes_receivable',
        account: { setting: 'notesReceivableAccountId' },
        side: 'debit',
        subledgerMinor: inHand,
        foreignExcluded: cheques.length - cheques.filter((c) => c.amount_currency === currency).length,
        includesJournalLines: true,
        lineColumn: null,
        link: '/treasury/cheques',
      },
    ];
  }
}

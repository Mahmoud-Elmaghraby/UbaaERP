import { Injectable, type OnModuleInit } from '@nestjs/common';
import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import { companyCurrency, LedgerCheckRegistry, sumPartyEntries, type LedgerCheckRow, type LedgerCheckSource } from '../../../../shared/integrity/ledger-checks';
import { SupplierLedgerSource } from './supplier-ledger.source';

/** Supplier balances (→ Suppliers account) and our cheques not yet cleared (→ أوراق الدفع) for the integrity check. */
@Injectable()
export class PurchasesLedgerChecks implements LedgerCheckSource, OnModuleInit {
  constructor(
    private readonly registry: LedgerCheckRegistry,
    private readonly suppliers: SupplierLedgerSource,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  async listChecks(db: Kysely<TenantDatabase>): Promise<LedgerCheckRow[]> {
    const currency = await companyCurrency(db);
    const balances = sumPartyEntries(await this.suppliers.listEntries(db, null), currency);
    // An endorsed customer cheque never passes through أوراق الدفع.
    const cheques = await db
      .selectFrom('supplier_payments')
      .select(['amount_amount', 'amount_currency'])
      .where('status', '=', 'posted')
      .where('payment_method', '=', 'check')
      .where('cheque_status', '=', 'issued')
      .where('endorsed_cheque_id', 'is', null)
      .execute();
    const issued = cheques.filter((c) => c.amount_currency === currency).reduce((sum, c) => sum + BigInt(c.amount_amount), 0n);
    return [
      {
        key: 'suppliers',
        account: { setting: 'accountsPayableAccountId' },
        side: 'credit',
        subledgerMinor: balances.totalMinor,
        foreignExcluded: balances.foreignExcluded,
        includesJournalLines: true,
        lineColumn: 'supplier_id',
        link: '/purchases/payables',
      },
      {
        key: 'notes_payable',
        account: { setting: 'notesPayableAccountId' },
        side: 'credit',
        subledgerMinor: issued,
        foreignExcluded: cheques.length - cheques.filter((c) => c.amount_currency === currency).length,
        includesJournalLines: true,
        lineColumn: null,
        link: '/treasury/cheques?tab=issued',
      },
    ];
  }
}

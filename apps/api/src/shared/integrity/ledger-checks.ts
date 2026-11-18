import { Global, Injectable, Module } from '@nestjs/common';
import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../database/tenant/kysely-client';
import type { PartyLedgerSourceEntry } from '../statements/party-statements';

/**
 * "فحص سلامة البيانات": each module says what one of its sub-ledgers holds right now (customer
 * balances, cheques in hand, a treasury's balance, stock value, open loans…) and which ledger
 * account should hold the same; Accounting compares the two. Modules register here, like treasury
 * movements, so Accounting never reaches into their logic (CLAUDE.md §2.6).
 *
 * Amounts are in the company currency only: anything in another currency is left out and counted
 * (the ledger holds it at its own rate, so it can't be compared one-to-one).
 */
export type LedgerCheckKey =
  | 'customers'
  | 'notes_receivable'
  | 'suppliers'
  | 'notes_payable'
  | 'treasury'
  | 'inventory'
  | 'employee_advances'
  | 'salaries_payable';

/** Accounting-settings mapping that names the ledger account (resolved by Accounting). */
export type LedgerCheckSetting =
  | 'accountsReceivableAccountId'
  | 'notesReceivableAccountId'
  | 'accountsPayableAccountId'
  | 'notesPayableAccountId'
  | 'inventoryAccountId'
  | 'employeeAdvancesAccountId'
  | 'salariesPayableAccountId';

export interface LedgerCheckRow {
  key: LedgerCheckKey;
  /** The ledger account: an accounting-settings mapping, or a treasury's own account. */
  account: { setting: LedgerCheckSetting } | { treasuryId: string };
  /** Shown instead of the key's label (a treasury's name). */
  label?: string | null;
  /** 'debit' = an asset (balance = debits − credits), 'credit' = a liability. */
  side: 'debit' | 'credit';
  subledgerMinor: bigint;
  /** Items in another currency, left out of subledgerMinor. */
  foreignExcluded: number;
  /** The journal-line column that ties a manual line to this sub-ledger (lines without it are unexplained). */
  lineColumn: 'customer_id' | 'supplier_id' | 'employee_id' | 'treasury_id' | null;
  /**
   * Whether subledgerMinor already counts posted journal lines naming the party / treasury (the
   * customer and supplier statements and treasury balances do). When false, Accounting adds them.
   */
  includesJournalLines: boolean;
  /** Where to look at the sub-ledger in the app. */
  link: string | null;
}

export interface LedgerCheckSource {
  listChecks(db: Kysely<TenantDatabase>): Promise<LedgerCheckRow[]>;
}

@Injectable()
export class LedgerCheckRegistry {
  private readonly sources: LedgerCheckSource[] = [];

  register(...sources: LedgerCheckSource[]): void {
    this.sources.push(...sources);
  }

  async list(db: Kysely<TenantDatabase>): Promise<LedgerCheckRow[]> {
    return (await Promise.all(this.sources.map((source) => source.listChecks(db)))).flat();
  }
}

export async function companyCurrency(db: Kysely<TenantDatabase>): Promise<string> {
  const row = await db.selectFrom('tenant_settings').select('currency_code').limit(1).executeTakeFirst();
  return row?.currency_code ?? 'EGP';
}

/** Σ of party-ledger entries in the company currency; parties with a non-zero balance in another one are counted. */
export function sumPartyEntries(entries: PartyLedgerSourceEntry[], currency: string): { totalMinor: bigint; foreignExcluded: number } {
  let totalMinor = 0n;
  const foreign = new Map<string, bigint>();
  for (const entry of entries) {
    if (entry.currency === currency) totalMinor += entry.amountMinor;
    else foreign.set(`${entry.partyId}:${entry.currency}`, (foreign.get(`${entry.partyId}:${entry.currency}`) ?? 0n) + entry.amountMinor);
  }
  return { totalMinor, foreignExcluded: [...foreign.values()].filter((v) => v !== 0n).length };
}

@Global()
@Module({ providers: [LedgerCheckRegistry], exports: [LedgerCheckRegistry] })
export class LedgerChecksModule {}

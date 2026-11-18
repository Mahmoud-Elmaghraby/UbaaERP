import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../database/tenant/kysely-client';
import type { PartyLedgerSourceEntry } from './party-statements';

/**
 * Posted journal lines that name a customer or supplier (migration 0132 — manual entries on the
 * Customers / Suppliers account: a bad-debt write-off, a set-off, moving a balance between two
 * parties…) as statement entries. Read-only, shared by the customer and supplier ledgers.
 *
 * Sign follows the party's balance: for a customer a debit raises what they owe us, for a
 * supplier a credit raises what we owe them. Always in the entry's (company) currency.
 */
export async function journalPartyEntries(
  db: Kysely<TenantDatabase>,
  kind: 'customer' | 'supplier',
  partyId: string | null,
): Promise<PartyLedgerSourceEntry[]> {
  const column: 'l.customer_id' | 'l.supplier_id' = kind === 'customer' ? 'l.customer_id' : 'l.supplier_id';
  let query = db
    .selectFrom('journal_entry_lines as l')
    .innerJoin('journal_entries as e', 'e.id', 'l.journal_entry_id')
    .select([
      'l.customer_id',
      'l.supplier_id',
      'l.debit_amount',
      'l.credit_amount',
      'l.description',
      'l.created_at',
      'e.id as entry_id',
      'e.entry_number',
      'e.entry_date',
      'e.currency',
      'e.description as entry_description',
    ])
    .where('e.status', '=', 'posted')
    .where(column, 'is not', null);
  if (partyId) query = query.where(column, '=', partyId);
  const rows = await query.execute();
  return rows.map((row) => {
    const debitMinusCredit = BigInt(row.debit_amount) - BigInt(row.credit_amount);
    return {
      partyId: (kind === 'customer' ? row.customer_id : row.supplier_id) as string,
      currency: row.currency,
      date: row.entry_date.slice(0, 10),
      kind: 'journal_entry' as const,
      documentId: row.entry_id,
      number: row.entry_number,
      reference: null,
      description: row.description ?? row.entry_description,
      amountMinor: kind === 'customer' ? debitMinusCredit : -debitMinusCredit,
      dueDate: null,
      sequence: row.created_at.toISOString(),
    };
  });
}

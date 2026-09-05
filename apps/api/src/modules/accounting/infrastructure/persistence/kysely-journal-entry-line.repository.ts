import { randomUUID } from 'node:crypto';
import type { Kysely, Selectable } from 'kysely';
import { Money } from '@erp-platform/shared-kernel';
import type { JournalEntryLinesTable, TenantDatabase } from '../../../../database/tenant/kysely-client';
import type {
  JournalEntryLineRepository,
  AccountMoneyTotals,
  PostedLedgerLine,
} from '../../application/ports/journal-entry-line.repository';
import type { JournalEntryLine, JournalEntryLineToPersist } from '../../domain/journal-entry.entity';

// A line's own currency isn't stored (see migration 0050) — the caller
// (JournalEntriesService) always knows the parent entry's currency and
// passes it in here so toDomain can reconstruct a proper Money instance.
function toDomain(row: Selectable<JournalEntryLinesTable>, currency: string): JournalEntryLine {
  return {
    id: row.id,
    journalEntryId: row.journal_entry_id,
    accountId: row.account_id,
    debitAmount: Money.fromMinorUnits(BigInt(row.debit_amount), currency),
    creditAmount: Money.fromMinorUnits(BigInt(row.credit_amount), currency),
    description: row.description,
    lineOrder: row.line_order,
    costCenterId: row.cost_center_id,
    isReconciled: row.is_reconciled,
    reconciledAt: row.reconciled_at,
    createdAt: row.created_at,
  };
}

export class KyselyJournalEntryLineRepository implements JournalEntryLineRepository {
  // currency is looked up once per call via a join, so callers of
  // listByJournalEntryId don't have to pass it in separately — simpler
  // call sites than threading currency through every caller.
  async listByJournalEntryId(db: Kysely<TenantDatabase>, journalEntryId: string): Promise<JournalEntryLine[]> {
    const rows = await db
      .selectFrom('journal_entry_lines')
      .innerJoin('journal_entries', 'journal_entries.id', 'journal_entry_lines.journal_entry_id')
      .select([
        'journal_entry_lines.id as id',
        'journal_entry_lines.journal_entry_id as journal_entry_id',
        'journal_entry_lines.account_id as account_id',
        'journal_entry_lines.debit_amount as debit_amount',
        'journal_entry_lines.credit_amount as credit_amount',
        'journal_entry_lines.description as description',
        'journal_entry_lines.line_order as line_order',
        'journal_entry_lines.cost_center_id as cost_center_id',
        'journal_entry_lines.is_reconciled as is_reconciled',
        'journal_entry_lines.reconciled_at as reconciled_at',
        'journal_entry_lines.created_at as created_at',
        'journal_entries.currency as currency',
      ])
      .where('journal_entry_lines.journal_entry_id', '=', journalEntryId)
      .orderBy('journal_entry_lines.line_order')
      .execute();

    // Built directly rather than routed through toDomain() — this
    // query's joined row shape (aliased columns from two tables) isn't
    // a Selectable<JournalEntryLinesTable>, so constructing the domain
    // object inline avoids a type mismatch between the two.
    return rows.map((row) => ({
      id: row.id,
      journalEntryId: row.journal_entry_id,
      accountId: row.account_id,
      debitAmount: Money.fromMinorUnits(BigInt(row.debit_amount), row.currency),
      creditAmount: Money.fromMinorUnits(BigInt(row.credit_amount), row.currency),
      description: row.description,
      lineOrder: row.line_order,
      costCenterId: row.cost_center_id,
      isReconciled: row.is_reconciled,
      reconciledAt: row.reconciled_at,
      createdAt: row.created_at,
    }));
  }

  async createMany(
    db: Kysely<TenantDatabase>,
    journalEntryId: string,
    lines: JournalEntryLineToPersist[],
  ): Promise<JournalEntryLine[]> {
    if (lines.length === 0) return [];
    const rows = await db
      .insertInto('journal_entry_lines')
      .values(
        lines.map((line, index) => ({
          id: randomUUID(),
          journal_entry_id: journalEntryId,
          account_id: line.accountId,
          debit_amount: line.debitAmount.toMinorUnits().toString(),
          credit_amount: line.creditAmount.toMinorUnits().toString(),
          description: line.description ?? null,
          line_order: index,
          cost_center_id: line.costCenterId ?? null,
        })),
      )
      .returningAll()
      .execute();
    return rows.map((row, index) => toDomain(row, lines[index].debitAmount.currency));
  }

  async deleteByJournalEntryId(db: Kysely<TenantDatabase>, journalEntryId: string): Promise<void> {
    await db.deleteFrom('journal_entry_lines').where('journal_entry_id', '=', journalEntryId).execute();
  }

  async listPostedByAccount(
    db: Kysely<TenantDatabase>,
    accountId: string,
    fromDate?: string,
    toDate?: string,
  ): Promise<PostedLedgerLine[]> {
    let query = db
      .selectFrom('journal_entry_lines')
      .innerJoin('journal_entries', 'journal_entries.id', 'journal_entry_lines.journal_entry_id')
      .select([
        'journal_entry_lines.id as id',
        'journal_entry_lines.journal_entry_id as journal_entry_id',
        'journal_entries.entry_number as entry_number',
        'journal_entries.entry_date as entry_date',
        'journal_entry_lines.description as description',
        'journal_entry_lines.debit_amount as debit_amount_minor_units',
        'journal_entry_lines.credit_amount as credit_amount_minor_units',
        'journal_entry_lines.is_reconciled as is_reconciled',
        'journal_entry_lines.reconciled_at as reconciled_at',
      ])
      .where('journal_entries.status', '=', 'posted')
      .where('journal_entry_lines.account_id', '=', accountId);
    if (fromDate) query = query.where('journal_entries.entry_date', '>=', fromDate);
    if (toDate) query = query.where('journal_entries.entry_date', '<=', toDate);

    const rows = await query
      .orderBy('journal_entries.entry_date')
      .orderBy('journal_entry_lines.line_order')
      .execute();

    return rows.map((row) => ({
      id: row.id,
      journalEntryId: row.journal_entry_id,
      entryNumber: row.entry_number,
      entryDate: row.entry_date,
      description: row.description,
      debitAmountMinorUnits: row.debit_amount_minor_units,
      creditAmountMinorUnits: row.credit_amount_minor_units,
      isReconciled: row.is_reconciled,
      reconciledAt: row.reconciled_at,
    }));
  }

  async sumPostedByAccountBefore(
    db: Kysely<TenantDatabase>,
    accountId: string,
    beforeDate: string,
  ): Promise<AccountMoneyTotals> {
    const row = await db
      .selectFrom('journal_entry_lines')
      .innerJoin('journal_entries', 'journal_entries.id', 'journal_entry_lines.journal_entry_id')
      .select((eb) => [
        eb.fn.sum<string>('journal_entry_lines.debit_amount').as('total_debit'),
        eb.fn.sum<string>('journal_entry_lines.credit_amount').as('total_credit'),
      ])
      .where('journal_entries.status', '=', 'posted')
      .where('journal_entry_lines.account_id', '=', accountId)
      .where('journal_entries.entry_date', '<', beforeDate)
      .executeTakeFirst();

    return {
      totalDebitMinorUnits: row?.total_debit ?? '0',
      totalCreditMinorUnits: row?.total_credit ?? '0',
    };
  }

  async sumPostedByAccounts(
    db: Kysely<TenantDatabase>,
    accountIds: string[],
    fromDate?: string,
    toDate?: string,
  ): Promise<Record<string, AccountMoneyTotals>> {
    if (accountIds.length === 0) return {};

    let query = db
      .selectFrom('journal_entry_lines')
      .innerJoin('journal_entries', 'journal_entries.id', 'journal_entry_lines.journal_entry_id')
      .select((eb) => [
        'journal_entry_lines.account_id as account_id',
        eb.fn.sum<string>('journal_entry_lines.debit_amount').as('total_debit'),
        eb.fn.sum<string>('journal_entry_lines.credit_amount').as('total_credit'),
      ])
      .where('journal_entries.status', '=', 'posted')
      .where('journal_entry_lines.account_id', 'in', accountIds);
    if (fromDate) query = query.where('journal_entries.entry_date', '>=', fromDate);
    if (toDate) query = query.where('journal_entries.entry_date', '<=', toDate);

    const rows = await query.groupBy('journal_entry_lines.account_id').execute();

    const result: Record<string, AccountMoneyTotals> = {};
    for (const row of rows) {
      result[row.account_id] = {
        totalDebitMinorUnits: row.total_debit ?? '0',
        totalCreditMinorUnits: row.total_credit ?? '0',
      };
    }
    return result;
  }

  async setReconciled(db: Kysely<TenantDatabase>, lineId: string, reconciled: boolean): Promise<JournalEntryLine | null> {
    const row = await db
      .updateTable('journal_entry_lines')
      .set({ is_reconciled: reconciled, reconciled_at: reconciled ? new Date() : null })
      .where('id', '=', lineId)
      .returningAll()
      .executeTakeFirst();
    if (!row) return null;
    // The parent entry's currency is needed to reconstruct Money — a
    // second lookup, same "line has no stored currency of its own"
    // shape as every other query here (see this file's own header note).
    // journal_entry_id is a NOT NULL FK — the parent entry always
    // exists; executeTakeFirstOrThrow() rather than a silent fallback
    // currency, matching the "never guess a currency" discipline
    // established elsewhere in this module (see JournalEntryForm's own
    // fix earlier in this project's history).
    const entry = await db
      .selectFrom('journal_entries')
      .select('currency')
      .where('id', '=', row.journal_entry_id)
      .executeTakeFirstOrThrow();
    return toDomain(row, entry.currency);
  }
}

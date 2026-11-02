import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { sql, type Kysely } from 'kysely';
import type { BankStatementLineDto, BookBankStatementLineDto, ImportBankStatementDto } from '@erp-platform/contracts';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import { withTransaction } from '../../../../database/tenant/transaction.util';
import { BusinessRuleError } from '../errors';
import { entityNotFound } from '../../../../shared/errors/entity-errors';
import { JournalEntriesService } from './journal-entries.service';
import { AccountingSettingsService } from './accounting-settings.service';
import { resolveTreasuryAccount } from './treasury-account-resolver';

export const BANK_STATEMENT_SOURCE = 'bank_statement_line';
const MATCH_WINDOW_DAYS = 7;

/**
 * Bank statement matching (استيراد كشف البنك). Statement lines are imported
 * from the bank's Excel/CSV (parsed on the client), then each one is
 * matched to the book line it corresponds to — same amount, nearby date,
 * suggested automatically — which also ticks that book line as reconciled.
 * A line with no counterpart in the books (bank charges, interest) is
 * booked straight from the statement against a chosen account.
 */
@Injectable()
export class BankStatementsService {
  constructor(
    private readonly journalEntries: JournalEntriesService,
    private readonly accountingSettings: AccountingSettingsService,
  ) {}

  async list(db: Kysely<TenantDatabase>, treasuryId: string, from?: string, to?: string): Promise<BankStatementLineDto[]> {
    let query = db.selectFrom('bank_statement_lines').selectAll().where('treasury_id', '=', treasuryId);
    if (from) query = query.where('line_date', '>=', from);
    if (to) query = query.where('line_date', '<=', to);
    const rows = await query.orderBy('line_date').orderBy('created_at').execute();
    const accountId = await this.treasuryAccount(db, treasuryId);
    const result: BankStatementLineDto[] = [];
    for (const row of rows) {
      const date = toIso(row.line_date);
      result.push({
        id: row.id,
        treasuryId: row.treasury_id,
        date,
        description: row.description,
        reference: row.reference,
        amountMinorUnits: String(row.amount),
        status: row.status as BankStatementLineDto['status'],
        matchedLineId: row.matched_line_id,
        suggestions: row.status === 'unmatched' ? await this.suggestions(db, accountId, BigInt(row.amount), date) : [],
      });
    }
    return result;
  }

  async import(db: Kysely<TenantDatabase>, treasuryId: string, input: ImportBankStatementDto): Promise<{ imported: number; matched: number }> {
    const treasury = await db.selectFrom('treasuries').select('id').where('id', '=', treasuryId).executeTakeFirst();
    if (!treasury) throw entityNotFound('TREASURY', treasuryId);
    const batch = randomUUID();
    const rows = input.lines.map((line) => ({
      id: randomUUID(),
      treasury_id: treasuryId,
      line_date: line.date,
      description: line.description ?? null,
      reference: line.reference ?? null,
      amount: line.amountMinorUnits,
      import_batch: batch,
    }));
    await db.insertInto('bank_statement_lines').values(rows).execute();

    // Auto-match the lines with exactly one candidate.
    const accountId = await this.treasuryAccount(db, treasuryId);
    let matched = 0;
    for (const row of rows) {
      const candidates = await this.suggestions(db, accountId, BigInt(row.amount), row.line_date);
      if (candidates.length === 1) {
        await this.match(db, row.id, candidates[0]!.lineId);
        matched += 1;
      }
    }
    return { imported: rows.length, matched };
  }

  async match(db: Kysely<TenantDatabase>, statementLineId: string, journalLineId: string): Promise<void> {
    await withTransaction(db, async (trx) => {
      const line = await this.find(trx, statementLineId);
      const accountId = await this.treasuryAccount(trx, line.treasury_id);
      const bookLine = await trx
        .selectFrom('journal_entry_lines as l')
        .innerJoin('journal_entries as e', 'e.id', 'l.journal_entry_id')
        .select(['l.id', 'l.account_id', 'l.debit_amount', 'l.credit_amount', 'e.status'])
        .where('l.id', '=', journalLineId)
        .executeTakeFirst();
      if (!bookLine || bookLine.account_id !== accountId || bookLine.status !== 'posted') {
        throw new BusinessRuleError('That entry line is not a posted movement of this bank account.', { code: 'BANK_STATEMENT.LINE_MISMATCH' });
      }
      const taken = await trx
        .selectFrom('bank_statement_lines')
        .select('id')
        .where('matched_line_id', '=', journalLineId)
        .where('id', '!=', statementLineId)
        .executeTakeFirst();
      if (taken) throw new BusinessRuleError('That entry line is already matched to another statement line.', { code: 'BANK_STATEMENT.ALREADY_MATCHED' });
      await trx.updateTable('bank_statement_lines').set({ status: 'matched', matched_line_id: journalLineId }).where('id', '=', statementLineId).execute();
      await trx.updateTable('journal_entry_lines').set({ is_reconciled: true, reconciled_at: new Date() }).where('id', '=', journalLineId).execute();
    });
  }

  async unmatch(db: Kysely<TenantDatabase>, statementLineId: string): Promise<void> {
    await withTransaction(db, async (trx) => {
      const line = await this.find(trx, statementLineId);
      if (line.matched_line_id) {
        await trx.updateTable('journal_entry_lines').set({ is_reconciled: false, reconciled_at: null }).where('id', '=', line.matched_line_id).execute();
      }
      await trx.updateTable('bank_statement_lines').set({ status: 'unmatched', matched_line_id: null }).where('id', '=', statementLineId).execute();
    });
  }

  async setIgnored(db: Kysely<TenantDatabase>, statementLineId: string, ignored: boolean): Promise<void> {
    const line = await this.find(db, statementLineId);
    if (line.status === 'matched') throw new BusinessRuleError('Unmatch the line first.', { code: 'BANK_STATEMENT.ALREADY_MATCHED' });
    await db.updateTable('bank_statement_lines').set({ status: ignored ? 'ignored' : 'unmatched' }).where('id', '=', statementLineId).execute();
  }

  async delete(db: Kysely<TenantDatabase>, statementLineId: string): Promise<void> {
    const line = await this.find(db, statementLineId);
    if (line.status === 'matched') throw new BusinessRuleError('Unmatch the line first.', { code: 'BANK_STATEMENT.ALREADY_MATCHED' });
    await db.deleteFrom('bank_statement_lines').where('id', '=', statementLineId).execute();
  }

  /** Books a statement-only line (bank charges, interest…) and matches it to the new entry. */
  async book(db: Kysely<TenantDatabase>, statementLineId: string, input: BookBankStatementLineDto): Promise<void> {
    await withTransaction(db, async (trx) => {
      const line = await this.find(trx, statementLineId);
      if (line.status !== 'unmatched') throw new BusinessRuleError('Only an unmatched line can be booked.', { code: 'BANK_STATEMENT.ALREADY_MATCHED' });
      const bankAccount = await this.treasuryAccount(trx, line.treasury_id);
      const amount = BigInt(line.amount);
      const abs = (amount < 0n ? -amount : amount).toString();
      const entry = await this.journalEntries.createAuto(trx, {
        entryDate: toIso(line.line_date),
        description: input.description ?? line.description ?? 'حركة من كشف البنك',
        lines:
          amount > 0n
            ? [
                { accountId: bankAccount, debitAmountMinorUnits: abs, creditAmountMinorUnits: '0' },
                { accountId: input.counterAccountId, debitAmountMinorUnits: '0', creditAmountMinorUnits: abs },
              ]
            : [
                { accountId: input.counterAccountId, debitAmountMinorUnits: abs, creditAmountMinorUnits: '0' },
                { accountId: bankAccount, debitAmountMinorUnits: '0', creditAmountMinorUnits: abs },
              ],
        sourceReferenceType: BANK_STATEMENT_SOURCE,
        sourceReferenceId: line.id,
      });
      const bankLine = entry.lines.find((l) => l.accountId === bankAccount);
      if (entry.status === 'posted' && bankLine) await this.match(trx, line.id, bankLine.id);
    });
  }

  private async suggestions(db: Kysely<TenantDatabase>, accountId: string, amount: bigint, date: string): Promise<BankStatementLineDto['suggestions']> {
    const rows = await db
      .selectFrom('journal_entry_lines as l')
      .innerJoin('journal_entries as e', 'e.id', 'l.journal_entry_id')
      .select(['l.id as line_id', 'e.id as entry_id', 'e.entry_number', 'e.entry_date', 'e.description'])
      .where('l.account_id', '=', accountId)
      .where('e.status', '=', 'posted')
      .where('l.is_reconciled', '=', false)
      .where(sql<boolean>`l.debit_amount - l.credit_amount = ${amount.toString()}::bigint`)
      .where(sql<boolean>`e.entry_date BETWEEN ${date}::date - ${MATCH_WINDOW_DAYS}::int AND ${date}::date + ${MATCH_WINDOW_DAYS}::int`)
      .where(sql<boolean>`NOT EXISTS (SELECT 1 FROM bank_statement_lines b WHERE b.matched_line_id = l.id)`)
      .orderBy(sql`abs(e.entry_date - ${date}::date)`)
      .limit(5)
      .execute();
    return rows.map((r) => ({
      lineId: r.line_id,
      journalEntryId: r.entry_id,
      entryNumber: r.entry_number,
      entryDate: toIso(r.entry_date),
      description: r.description,
    }));
  }

  private async treasuryAccount(db: Kysely<TenantDatabase>, treasuryId: string): Promise<string> {
    return resolveTreasuryAccount(db, await this.accountingSettings.get(db), { treasuryId });
  }

  private async find(db: Kysely<TenantDatabase>, id: string) {
    const row = await db.selectFrom('bank_statement_lines').selectAll().where('id', '=', id).executeTakeFirst();
    if (!row) throw entityNotFound('BANK_STATEMENT_LINE', id);
    return row;
  }
}

function toIso(value: string | Date): string {
  if (typeof value === 'string') return value.slice(0, 10);
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
}

import { Inject, Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import { Money } from '@erp-platform/shared-kernel';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import { BANK_ACCOUNT_REPOSITORY, type BankAccountRepository } from '../ports/bank-account.repository';
import {
  JOURNAL_ENTRY_LINE_REPOSITORY,
  type JournalEntryLineRepository,
} from '../ports/journal-entry-line.repository';
import type {
  BankAccount,
  BankAccountFilters,
  BankAccountRegister,
  BankAccountRegisterLine,
  CreateBankAccountInput,
  UpdateBankAccountInput,
} from '../../domain/bank-account.entity';
import { BusinessRuleError, ConflictError, NotFoundError, isPostgresUniqueViolation } from '../errors';
import { ChartOfAccountsService } from './chart-of-accounts.service';
import { categoryCanonicalSide } from './account-balance-sign';

/**
 * Bank Accounts (CLAUDE.md §10 — step 5, Accounting, Stage 5). See
 * migration 0058's own comment for the chart_of_account_id link,
 * uniqueness, and opening-balance reasoning.
 *
 * getRegister() and reconcile()/unreconcile() are the "linking journal
 * entries to bank movements" half of the roadmap item — they don't
 * introduce a new ledger, they read/annotate the same
 * journal_entry_lines the general ledger report already reads
 * (JournalEntryLineRepository.listPostedByAccount(), scoped to this
 * bank account's own chartOfAccountId), same "no stored table, computed
 * on read" discipline as AccountingReportsService.generalLedger() —
 * only isReconciled/reconciledAt are actually persisted per line
 * (migration 0057), everything else here is derived.
 */
@Injectable()
export class BankAccountsService {
  constructor(
    @Inject(BANK_ACCOUNT_REPOSITORY) private readonly repository: BankAccountRepository,
    @Inject(JOURNAL_ENTRY_LINE_REPOSITORY) private readonly journalEntryLines: JournalEntryLineRepository,
    private readonly chartOfAccounts: ChartOfAccountsService,
  ) {}

  list(db: Kysely<TenantDatabase>, filters?: BankAccountFilters): Promise<BankAccount[]> {
    return this.repository.list(db, filters);
  }

  async getById(db: Kysely<TenantDatabase>, id: string): Promise<BankAccount> {
    const bankAccount = await this.repository.findById(db, id);
    if (!bankAccount) throw new NotFoundError(`Bank account "${id}" not found.`);
    return bankAccount;
  }

  async create(db: Kysely<TenantDatabase>, input: CreateBankAccountInput): Promise<BankAccount> {
    // Must be a postable (leaf, active) account — same rule journal
    // entry lines themselves are held to, since this is exactly where
    // this bank account's own movements will be posted.
    await this.chartOfAccounts.assertPostable(db, input.chartOfAccountId);

    try {
      return await this.repository.create(db, input);
    } catch (err) {
      if (isPostgresUniqueViolation(err)) {
        throw new ConflictError(
          'Another bank account is already linked to that chart of accounts entry — each GL account can back at most one bank account.',
        );
      }
      throw err;
    }
  }

  async update(db: Kysely<TenantDatabase>, id: string, input: UpdateBankAccountInput): Promise<BankAccount> {
    await this.getById(db, id);
    const updated = await this.repository.update(db, id, input);
    if (!updated) throw new NotFoundError(`Bank account "${id}" not found.`);
    return updated;
  }

  async delete(db: Kysely<TenantDatabase>, id: string): Promise<void> {
    await this.getById(db, id);
    // No "still referenced" guard needed: deleting a bank account only
    // removes this descriptive/reconciliation-metadata row — the
    // journal_entry_lines it was reading from belong to the GL account
    // (chart_of_accounts), not to the bank account, and are completely
    // untouched by this delete.
    const deleted = await this.repository.delete(db, id);
    if (!deleted) throw new NotFoundError(`Bank account "${id}" not found.`);
  }

  /**
   * The bank account's register: every posted line against its linked
   * GL account, running balance seeded from the account's own
   * openingBalance (a stored business fact, see migration 0058's
   * comment) plus everything posted strictly before fromDate — same
   * opening-balance algorithm as AccountingReportsService.generalLedger(),
   * just seeded from a real opening balance instead of zero, and reusing
   * PostedLedgerLine.isReconciled/reconciledAt (Stage 5) that
   * general-ledger reporting doesn't need and therefore doesn't surface.
   */
  async getRegister(
    db: Kysely<TenantDatabase>,
    id: string,
    fromDate?: string,
    toDate?: string,
  ): Promise<BankAccountRegister> {
    const bankAccount = await this.getById(db, id);
    const currency = bankAccount.currency;
    // Same categoryCanonicalSide-based signing as
    // AccountingReportsService.generalLedger() — deliberately NOT a
    // hardcoded "debit always increases" assumption, even though every
    // bank account will realistically link to an asset (debit-
    // canonical) account: chart_of_accounts' own accountType is what
    // actually decides the sign, exactly like every other report in
    // this module (see account-balance-sign.ts's own comment for why).
    const glAccount = await this.chartOfAccounts.getById(db, bankAccount.chartOfAccountId);
    const side = categoryCanonicalSide(glAccount.accountType);

    let runningBalance = bankAccount.openingBalance;
    if (fromDate) {
      const before = await this.journalEntryLines.sumPostedByAccountBefore(db, bankAccount.chartOfAccountId, fromDate);
      const beforeDebit = Money.fromMinorUnits(BigInt(before.totalDebitMinorUnits), currency);
      const beforeCredit = Money.fromMinorUnits(BigInt(before.totalCreditMinorUnits), currency);
      runningBalance =
        side === 'debit' ? runningBalance.add(beforeDebit).subtract(beforeCredit) : runningBalance.add(beforeCredit).subtract(beforeDebit);
    }
    const openingBalance = runningBalance;

    const posted = await this.journalEntryLines.listPostedByAccount(db, bankAccount.chartOfAccountId, fromDate, toDate);
    const lines: BankAccountRegisterLine[] = posted.map((line) => {
      const debitAmount = Money.fromMinorUnits(BigInt(line.debitAmountMinorUnits), currency);
      const creditAmount = Money.fromMinorUnits(BigInt(line.creditAmountMinorUnits), currency);
      runningBalance =
        side === 'debit' ? runningBalance.add(debitAmount).subtract(creditAmount) : runningBalance.add(creditAmount).subtract(debitAmount);
      return {
        id: line.id,
        journalEntryId: line.journalEntryId,
        entryNumber: line.entryNumber,
        entryDate: line.entryDate,
        description: line.description,
        debitAmount,
        creditAmount,
        runningBalance,
        isReconciled: line.isReconciled,
        reconciledAt: line.reconciledAt,
      };
    });

    return {
      bankAccountId: bankAccount.id,
      fromDate: fromDate ?? null,
      toDate: toDate ?? null,
      openingBalance,
      lines,
      closingBalance: runningBalance,
    };
  }

  /**
   * Toggles one register line's reconciliation status. Verifies the
   * line actually belongs to this bank account's own linked GL account
   * first — without this check a client could reconcile an arbitrary
   * journal_entry_line by id under the wrong bank account's URL.
   */
  async setLineReconciled(
    db: Kysely<TenantDatabase>,
    bankAccountId: string,
    lineId: string,
    reconciled: boolean,
  ): Promise<BankAccountRegisterLine> {
    const bankAccount = await this.getById(db, bankAccountId);
    const posted = await this.journalEntryLines.listPostedByAccount(db, bankAccount.chartOfAccountId);
    const match = posted.find((line) => line.id === lineId);
    if (!match) {
      throw new BusinessRuleError(
        `Journal entry line "${lineId}" is not a posted line on bank account "${bankAccount.name}"'s linked account.`,
      );
    }

    const updatedLine = await this.journalEntryLines.setReconciled(db, lineId, reconciled);
    if (!updatedLine) throw new NotFoundError(`Journal entry line "${lineId}" not found.`);

    return {
      id: updatedLine.id,
      journalEntryId: updatedLine.journalEntryId,
      entryNumber: match.entryNumber,
      entryDate: match.entryDate,
      description: updatedLine.description,
      debitAmount: updatedLine.debitAmount,
      creditAmount: updatedLine.creditAmount,
      // runningBalance has no meaning for a single toggled line outside
      // its register context — left as the line's own debit-credit net
      // change rather than recomputing the whole register just for this
      // response; the frontend re-fetches the register after a toggle
      // anyway (see useReconcileLine()'s onSuccess invalidation).
      runningBalance: updatedLine.debitAmount.subtract(updatedLine.creditAmount),
      isReconciled: updatedLine.isReconciled,
      reconciledAt: updatedLine.reconciledAt,
    };
  }
}

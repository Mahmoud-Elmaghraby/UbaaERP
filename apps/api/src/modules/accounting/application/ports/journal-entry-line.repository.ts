import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import type { JournalEntryLine, JournalEntryLineToPersist } from '../../domain/journal-entry.entity';

export interface AccountMoneyTotals {
  totalDebitMinorUnits: string;
  totalCreditMinorUnits: string;
}

export interface PostedLedgerLine {
  id: string;
  journalEntryId: string;
  entryNumber: string;
  entryDate: string;
  description: string | null;
  debitAmountMinorUnits: string;
  creditAmountMinorUnits: string;
  /** Bank reconciliation status (Stage 5) — carried through here so BankAccountsService.getRegister() doesn't need a second query per line. */
  isReconciled: boolean;
  reconciledAt: Date | null;
}

export interface JournalEntryLineRepository {
  listByJournalEntryId(db: Kysely<TenantDatabase>, journalEntryId: string): Promise<JournalEntryLine[]>;
  createMany(
    db: Kysely<TenantDatabase>,
    journalEntryId: string,
    lines: JournalEntryLineToPersist[],
  ): Promise<JournalEntryLine[]>;
  deleteByJournalEntryId(db: Kysely<TenantDatabase>, journalEntryId: string): Promise<void>;

  /** Posted lines for one account, optionally date-bounded, joined with their parent entry — ordered by entry_date then line_order (for the general ledger). */
  listPostedByAccount(
    db: Kysely<TenantDatabase>,
    accountId: string,
    fromDate?: string,
    toDate?: string,
  ): Promise<PostedLedgerLine[]>;

  /** Sum of posted debit/credit for one account, strictly before `beforeDate` (a general-ledger opening balance). */
  sumPostedByAccountBefore(
    db: Kysely<TenantDatabase>,
    accountId: string,
    beforeDate: string,
  ): Promise<AccountMoneyTotals>;

  /** Sum of posted debit/credit per account across a set of accountIds, optionally date-bounded (trial balance / income statement / balance sheet). Accounts with no activity are omitted from the result map. */
  sumPostedByAccounts(
    db: Kysely<TenantDatabase>,
    accountIds: string[],
    fromDate?: string,
    toDate?: string,
  ): Promise<Record<string, AccountMoneyTotals>>;

  /**
   * Bank reconciliation (Stage 5) — flips one line's isReconciled flag,
   * stamping/clearing reconciledAt to match. Returns null if the line
   * doesn't exist. BankAccountsService is what checks the line actually
   * belongs to the bank account's linked GL account before calling this
   * — the repository itself has no notion of "bank account."
   */
  setReconciled(db: Kysely<TenantDatabase>, lineId: string, reconciled: boolean): Promise<JournalEntryLine | null>;
}

export const JOURNAL_ENTRY_LINE_REPOSITORY = Symbol('JOURNAL_ENTRY_LINE_REPOSITORY');

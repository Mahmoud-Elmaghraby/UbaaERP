import type { Money } from '@erp-platform/shared-kernel';

/**
 * Journal entry (CLAUDE.md §10 — step 5, Accounting, Stage 2). The
 * actual double-entry ledger. See migration 0050_create_journal_entries
 * for the full reasoning (single-currency-per-entry, exactly-one-side-
 * per-line, reversal-not-void).
 *
 * Two input shapes for a line, deliberately different from the
 * Purchases/Sales unitPrice-per-line precedent: there a line's Money
 * carries its own currency (the user picks it per document). Here the
 * whole entry has exactly one currency, always the tenant's own
 * tenant_settings.currencyCode — server-determined, never user-supplied
 * — so a line only carries raw minor-units strings in from the
 * controller (CreateJournalEntryLineInput); JournalEntriesService is
 * what knows the entry's currency and constructs real Money instances
 * from them (JournalEntryLineToPersist) before handing lines to the
 * repository.
 */
export type JournalEntryStatus = 'draft' | 'posted' | 'cancelled';
export type JournalEntrySource = 'manual' | 'auto';

export interface JournalEntryLine {
  id: string;
  journalEntryId: string;
  accountId: string;
  /** Always the entry's own currency; exactly one of debitAmount/creditAmount is non-zero. */
  debitAmount: Money;
  creditAmount: Money;
  description: string | null;
  lineOrder: number;
  /** Optional cost-center tag (Stage 4) — never required, never validated against the balance invariant. */
  costCenterId: string | null;
  /** Bank reconciliation status (Stage 5) — meaningful only for lines posted to an account a BankAccount links to; NULL/false everywhere else. See BankAccountsService. */
  isReconciled: boolean;
  reconciledAt: Date | null;
  createdAt: Date;
}

export interface JournalEntry {
  id: string;
  entryNumber: string;
  entryDate: string;
  currency: string;
  status: JournalEntryStatus;
  source: JournalEntrySource;
  description: string | null;
  reversalOfEntryId: string | null;
  postedAt: Date | null;
  notes: string | null;
  customFields: Record<string, unknown>;
  /** Set only on auto-generated entries (source = 'auto') — the idempotency key auto-posting listeners key off. See migration 0051. */
  sourceReferenceType: string | null;
  sourceReferenceId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface JournalEntryWithLines extends JournalEntry {
  lines: JournalEntryLine[];
}

/** As received from the controller — not yet validated or converted to Money. */
export interface CreateJournalEntryLineInput {
  accountId: string;
  debitAmountMinorUnits: string;
  creditAmountMinorUnits: string;
  description?: string | null;
  /** Optional cost-center tag (Stage 4) — no validation beyond "the referenced row exists" (enforced by the FK; ON DELETE SET NULL, see migration 0056). */
  costCenterId?: string | null;
}

export interface CreateJournalEntryInput {
  entryDate: string;
  description?: string | null;
  notes?: string | null;
  customFields?: Record<string, unknown>;
  lines: CreateJournalEntryLineInput[];
}

export type UpdateJournalEntryInput = CreateJournalEntryInput;

/**
 * The internal-only creation shape for Accounting's own auto-posting
 * listeners (Stage 6/7) — never reachable from the public Zod contract,
 * since sourceReferenceType/sourceReferenceId are decided by the caller
 * (an @OnEvent handler), never by a user. See JournalEntriesService.createAuto().
 */
export interface CreateAutoJournalEntryInput {
  entryDate: string;
  description?: string | null;
  lines: CreateJournalEntryLineInput[];
  sourceReferenceType: string;
  sourceReferenceId: string;
}

/** Built by JournalEntriesService after validation — what the repository actually persists. */
export interface JournalEntryLineToPersist {
  accountId: string;
  debitAmount: Money;
  creditAmount: Money;
  description: string | null;
  costCenterId: string | null;
}

export interface JournalEntryFilters {
  status?: JournalEntryStatus;
  fromDate?: string;
  toDate?: string;
}

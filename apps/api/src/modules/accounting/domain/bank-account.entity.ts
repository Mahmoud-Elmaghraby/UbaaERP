import type { Money } from '@erp-platform/shared-kernel';

/**
 * Bank account (CLAUDE.md §10 — step 5, Accounting, Stage 5). See
 * migration 0058's own comment for the chart_of_account_id link and
 * opening-balance reasoning.
 */
export interface BankAccount {
  id: string;
  name: string;
  bankName: string;
  accountNumber: string;
  iban: string | null;
  currency: string;
  chartOfAccountId: string;
  openingBalance: Money;
  openingBalanceDate: string | null;
  isActive: boolean;
  notes: string | null;
  customFields: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateBankAccountInput {
  name: string;
  bankName: string;
  accountNumber: string;
  iban?: string | null;
  currency: string;
  chartOfAccountId: string;
  openingBalanceMinorUnits?: string;
  openingBalanceDate?: string | null;
  notes?: string | null;
  customFields?: Record<string, unknown>;
}

// chartOfAccountId and currency are deliberately absent — same
// "immutable after creation" discipline as ChartOfAccount's own
// accountType/normalBalance/parentId: repointing which GL account a
// bank account represents, or changing its currency, after real ledger
// activity may already exist under it would silently corrupt the
// register/reconciliation history. Delete and recreate instead if a
// tenant genuinely mis-configured this at setup time.
export interface UpdateBankAccountInput {
  name?: string;
  bankName?: string;
  accountNumber?: string;
  iban?: string | null;
  isActive?: boolean;
  notes?: string | null;
  customFields?: Record<string, unknown>;
}

export interface BankAccountFilters {
  isActive?: boolean;
}

/** One line of a bank account's register (Stage 5) — a posted journal_entry_line touching its linked GL account, plus a running balance and reconciliation status. */
export interface BankAccountRegisterLine {
  id: string;
  journalEntryId: string;
  entryNumber: string;
  entryDate: string;
  description: string | null;
  debitAmount: Money;
  creditAmount: Money;
  runningBalance: Money;
  isReconciled: boolean;
  reconciledAt: Date | null;
}

export interface BankAccountRegister {
  bankAccountId: string;
  fromDate: string | null;
  toDate: string | null;
  openingBalance: Money;
  lines: BankAccountRegisterLine[];
  closingBalance: Money;
}

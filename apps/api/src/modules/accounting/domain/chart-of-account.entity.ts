/**
 * Chart of accounts entry (CLAUDE.md §10 — step 5, Accounting, Stage 1).
 * See migration 0048_create_chart_of_accounts for the tree-shape/
 * is_group/is_system reasoning — this file just mirrors that shape as
 * TypeScript types.
 */
export type AccountType = 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';
export type NormalBalance = 'debit' | 'credit';

export interface ChartOfAccount {
  id: string;
  code: string;
  name: string;
  accountType: AccountType;
  normalBalance: NormalBalance;
  parentId: string | null;
  /** True = a folder in the tree; cannot receive postings (see ChartOfAccountsService.assertPostable). */
  isGroup: boolean;
  /** True only for the five root accounts — cannot be deactivated or deleted. */
  isSystem: boolean;
  isActive: boolean;
  notes: string | null;
  customFields: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateChartOfAccountInput {
  code: string;
  name: string;
  accountType: AccountType;
  normalBalance: NormalBalance;
  parentId?: string | null;
  isGroup?: boolean;
  notes?: string | null;
  customFields?: Record<string, unknown>;
}

/** See updateChartOfAccountSchema (libs/contracts) for why this is deliberately narrow. */
export interface UpdateChartOfAccountInput {
  code?: string;
  name?: string;
  isActive?: boolean;
  notes?: string | null;
  customFields?: Record<string, unknown>;
}

export interface ChartOfAccountFilters {
  accountType?: AccountType;
  isActive?: boolean;
}

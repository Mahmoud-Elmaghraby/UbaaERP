import { z } from 'zod';
import { createJournalEntryLineSchema } from './journal-entry.contract';

/*
 * Accounting completion (migration 0106): recurring entries, fixed assets,
 * budgets and bank statement matching. Amounts are minor-unit integer
 * strings in the tenant currency — never floats.
 */
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected an ISO date (YYYY-MM-DD)');
const minor = z.string().regex(/^\d+$/, 'Must be a non-negative integer string');
const signedMinor = z.string().regex(/^-?\d+$/, 'Must be an integer string');

// ── Recurring journal entries ─────────────────────────────────────────────
export const recurringFrequencySchema = z.enum(['monthly', 'quarterly', 'yearly']);
export type RecurringFrequencyDto = z.infer<typeof recurringFrequencySchema>;

export const recurringEntrySchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  description: z.string().nullable(),
  frequency: recurringFrequencySchema,
  startDate: isoDate,
  nextRunDate: isoDate,
  endDate: isoDate.nullable(),
  autoPost: z.boolean(),
  isActive: z.boolean(),
  lines: z.array(createJournalEntryLineSchema),
  lastEntryId: z.string().uuid().nullable(),
});
export type RecurringEntryDto = z.infer<typeof recurringEntrySchema>;

export const saveRecurringEntrySchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).nullable().optional(),
  frequency: recurringFrequencySchema,
  startDate: isoDate,
  endDate: isoDate.nullable().optional(),
  autoPost: z.boolean().optional(),
  isActive: z.boolean().optional(),
  lines: z.array(createJournalEntryLineSchema).min(2),
});
export type SaveRecurringEntryDto = z.infer<typeof saveRecurringEntrySchema>;

// ── Fixed assets ─────────────────────────────────────────────────────────
export const fixedAssetStatusSchema = z.enum(['active', 'fully_depreciated', 'disposed']);

export const fixedAssetSchema = z.object({
  id: z.string().uuid(),
  code: z.string(),
  name: z.string(),
  acquisitionDate: isoDate,
  depreciationStart: isoDate,
  costMinorUnits: minor,
  salvageMinorUnits: minor,
  openingAccumulatedMinorUnits: minor,
  usefulLifeMonths: z.number().int().positive(),
  assetAccountId: z.string().uuid(),
  accumulatedAccountId: z.string().uuid(),
  expenseAccountId: z.string().uuid(),
  costCenterId: z.string().uuid().nullable(),
  status: fixedAssetStatusSchema,
  disposedAt: isoDate.nullable(),
  notes: z.string().nullable(),
  /** Opening + every posted depreciation. */
  accumulatedMinorUnits: minor,
  /** Cost − accumulated. */
  bookValueMinorUnits: signedMinor,
  /** Straight-line amount for a full month. */
  monthlyDepreciationMinorUnits: minor,
  lastDepreciatedThrough: isoDate.nullable(),
});
export type FixedAssetDto = z.infer<typeof fixedAssetSchema>;

export const saveFixedAssetSchema = z.object({
  code: z.string().trim().max(40).optional(),
  name: z.string().trim().min(1).max(160),
  acquisitionDate: isoDate,
  depreciationStart: isoDate.optional(),
  costMinorUnits: minor,
  salvageMinorUnits: minor.optional(),
  openingAccumulatedMinorUnits: minor.optional(),
  usefulLifeMonths: z.number().int().positive().max(1200),
  assetAccountId: z.string().uuid(),
  accumulatedAccountId: z.string().uuid(),
  expenseAccountId: z.string().uuid(),
  costCenterId: z.string().uuid().nullable().optional(),
  notes: z.string().trim().max(500).nullable().optional(),
});
export type SaveFixedAssetDto = z.infer<typeof saveFixedAssetSchema>;

export const fixedAssetDepreciationSchema = z.object({
  id: z.string().uuid(),
  periodEnd: isoDate,
  amountMinorUnits: minor,
  journalEntryId: z.string().uuid().nullable(),
});
export type FixedAssetDepreciationDto = z.infer<typeof fixedAssetDepreciationSchema>;

export const disposeFixedAssetSchema = z.object({
  date: isoDate,
  /** What the asset was sold for (0 = scrapped). */
  proceedsMinorUnits: minor,
  /** Where the proceeds went (a treasury/bank or receivable account); required when proceeds > 0. */
  proceedsAccountId: z.string().uuid().nullable().optional(),
  /** Gain or loss on disposal. */
  gainLossAccountId: z.string().uuid(),
});
export type DisposeFixedAssetDto = z.infer<typeof disposeFixedAssetSchema>;

export const depreciationRunResultSchema = z.object({
  assets: z.number().int(),
  entries: z.number().int(),
  totalMinorUnits: minor,
});
export type DepreciationRunResultDto = z.infer<typeof depreciationRunResultSchema>;

// ── Budgets ──────────────────────────────────────────────────────────────
export const budgetLineSchema = z.object({
  accountId: z.string().uuid(),
  /** 12 monthly amounts (minor units), January … December of the fiscal year's order. */
  months: z.array(signedMinor).length(12),
});
export type BudgetLineDto = z.infer<typeof budgetLineSchema>;

export const budgetSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  fiscalYearId: z.string().uuid(),
  notes: z.string().nullable(),
  lines: z.array(budgetLineSchema),
});
export type BudgetDto = z.infer<typeof budgetSchema>;

export const saveBudgetSchema = z.object({
  name: z.string().trim().min(1).max(120),
  fiscalYearId: z.string().uuid(),
  notes: z.string().trim().max(500).nullable().optional(),
  lines: z.array(budgetLineSchema).max(2000),
});
export type SaveBudgetDto = z.infer<typeof saveBudgetSchema>;

export const budgetVsActualRowSchema = z.object({
  accountId: z.string().uuid(),
  accountCode: z.string(),
  accountName: z.string(),
  accountType: z.string(),
  budgetMinorUnits: signedMinor,
  actualMinorUnits: signedMinor,
  varianceMinorUnits: signedMinor,
});
export const budgetVsActualSchema = z.object({
  budgetId: z.string().uuid(),
  fromDate: isoDate,
  toDate: isoDate,
  currency: z.string(),
  rows: z.array(budgetVsActualRowSchema),
});
export type BudgetVsActualDto = z.infer<typeof budgetVsActualSchema>;

// ── Bank statement matching ──────────────────────────────────────────────
export const bankStatementLineStatusSchema = z.enum(['unmatched', 'matched', 'ignored']);
export const bankStatementLineSchema = z.object({
  id: z.string().uuid(),
  treasuryId: z.string().uuid(),
  date: isoDate,
  description: z.string().nullable(),
  reference: z.string().nullable(),
  /** + deposit, − withdrawal. */
  amountMinorUnits: signedMinor,
  status: bankStatementLineStatusSchema,
  matchedLineId: z.string().uuid().nullable(),
  /** Best book-line candidates while unmatched (same amount, date within 7 days). */
  suggestions: z.array(
    z.object({
      lineId: z.string().uuid(),
      journalEntryId: z.string().uuid(),
      entryNumber: z.string(),
      entryDate: isoDate,
      description: z.string().nullable(),
    }),
  ),
});
export type BankStatementLineDto = z.infer<typeof bankStatementLineSchema>;

export const importBankStatementSchema = z.object({
  lines: z
    .array(
      z.object({
        date: isoDate,
        description: z.string().max(500).nullable().optional(),
        reference: z.string().max(120).nullable().optional(),
        amountMinorUnits: signedMinor.refine((v) => v !== '0' && v !== '-0', 'Amount cannot be zero'),
      }),
    )
    .min(1)
    .max(5000),
});
export type ImportBankStatementDto = z.infer<typeof importBankStatementSchema>;

export const matchBankStatementLineSchema = z.object({ journalLineId: z.string().uuid() });
export type MatchBankStatementLineDto = z.infer<typeof matchBankStatementLineSchema>;

/** Book an unmatched statement line (bank charges, interest…) against a counter account. */
export const bookBankStatementLineSchema = z.object({
  counterAccountId: z.string().uuid(),
  description: z.string().trim().max(500).nullable().optional(),
});
export type BookBankStatementLineDto = z.infer<typeof bookBankStatementLineSchema>;

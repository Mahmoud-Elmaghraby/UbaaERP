import { z } from 'zod';
import { moneySchema } from '../inventory/money.contract';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected an ISO date (YYYY-MM-DD)');

export const journalEntryStatusSchema = z.enum(['draft', 'posted', 'cancelled']);
export type JournalEntryStatus = z.infer<typeof journalEntryStatusSchema>;

export const journalEntrySourceSchema = z.enum(['manual', 'auto']);
export type JournalEntrySource = z.infer<typeof journalEntrySourceSchema>;

export const journalEntryLineSchema = z.object({
  id: z.string().uuid(),
  journalEntryId: z.string().uuid(),
  accountId: z.string().uuid(),
  debitAmount: moneySchema,
  creditAmount: moneySchema,
  description: z.string().nullable(),
  lineOrder: z.number().int(),
  /** Optional cost-center tag (Stage 4). */
  costCenterId: z.string().uuid().nullable(),
  /** Migration 0132: the party / treasury a manual line belongs to, with display names. */
  customerId: z.string().uuid().nullable().default(null),
  supplierId: z.string().uuid().nullable().default(null),
  employeeId: z.string().uuid().nullable().default(null),
  treasuryId: z.string().uuid().nullable().default(null),
  partyName: z.string().nullable().default(null),
  treasuryName: z.string().nullable().default(null),
  /** Bank reconciliation status (Stage 5) — see BankAccountsService. */
  isReconciled: z.boolean(),
  reconciledAt: z.coerce.date().nullable(),
  createdAt: z.coerce.date(),
});
export type JournalEntryLineDto = z.infer<typeof journalEntryLineSchema>;

export const journalEntrySchema = z.object({
  /** Migration 0130: the branch it belongs to. */
  branchId: z.string().uuid().nullable().optional(),
  id: z.string().uuid(),
  entryNumber: z.string(),
  entryDate: isoDate,
  currency: z.string().regex(/^[A-Z]{3}$/, 'currency must be a three-letter ISO 4217 code'),
  status: journalEntryStatusSchema,
  source: journalEntrySourceSchema,
  description: z.string().nullable(),
  reversalOfEntryId: z.string().uuid().nullable(),
  postedAt: z.coerce.date().nullable(),
  notes: z.string().nullable(),
  customFields: z.record(z.unknown()),
  /** Set only on auto-generated entries (source = 'auto') — see migration 0051. */
  sourceReferenceType: z.string().nullable(),
  sourceReferenceId: z.string().uuid().nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type JournalEntryDto = z.infer<typeof journalEntrySchema>;

export const journalEntryWithLinesSchema = journalEntrySchema.extend({
  lines: z.array(journalEntryLineSchema),
});
export type JournalEntryWithLinesDto = z.infer<typeof journalEntryWithLinesSchema>;

// amountMinorUnits is a plain non-negative integer string per side — one
// of debitAmountMinorUnits/creditAmountMinorUnits must be "0" and the
// other must be a positive integer string (JournalEntriesService
// enforces this; the CHECK constraint on the DB side is the second line
// of defense, see migration 0050).
export const createJournalEntryLineSchema = z.object({
  accountId: z.string().uuid(),
  debitAmountMinorUnits: z.string().regex(/^\d+$/, 'debitAmountMinorUnits must be a non-negative integer string'),
  creditAmountMinorUnits: z.string().regex(/^\d+$/, 'creditAmountMinorUnits must be a non-negative integer string'),
  description: z.string().nullable().optional(),
  /** Optional cost-center tag (Stage 4) — no effect on the balance invariant. */
  costCenterId: z.string().uuid().nullable().optional(),
  /**
   * Migration 0132: required on some accounts (GET /journal-entries/line-rules) — the customer on
   * the Customers account, the supplier on Suppliers, the employee on advances / salaries payable,
   * the treasury on a treasury's account. Ignored elsewhere.
   */
  customerId: z.string().uuid().nullable().optional(),
  supplierId: z.string().uuid().nullable().optional(),
  employeeId: z.string().uuid().nullable().optional(),
  treasuryId: z.string().uuid().nullable().optional(),
});
export type CreateJournalEntryLineDto = z.infer<typeof createJournalEntryLineSchema>;

export const createJournalEntrySchema = z.object({
  entryDate: isoDate,
  description: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  customFields: z.record(z.unknown()).optional(),
  lines: z.array(createJournalEntryLineSchema).min(2, 'A journal entry needs at least two lines to balance'),
});
export type CreateJournalEntryDto = z.infer<typeof createJournalEntrySchema>;

// Same shape as create — an update replaces the entry's lines wholesale
// (JournalEntriesService.update(), draft-only), matching how Quotations/
// Sales Orders replace their lines on edit rather than patching in place.
export const updateJournalEntrySchema = z.object({
  entryDate: isoDate,
  description: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  customFields: z.record(z.unknown()).optional(),
  lines: z.array(createJournalEntryLineSchema).min(2, 'A journal entry needs at least two lines to balance'),
});
export type UpdateJournalEntryDto = z.infer<typeof updateJournalEntrySchema>;

export const reverseJournalEntrySchema = z.object({
  reversalDate: isoDate.optional(),
  description: z.string().nullable().optional(),
});
export type ReverseJournalEntryDto = z.infer<typeof reverseJournalEntrySchema>;

/** GET /journal-entries/line-rules — what a manual line on each special account must carry. */
export const journalLineRuleKindSchema = z.enum(['customer', 'supplier', 'employee', 'treasury', 'locked']);
export type JournalLineRuleKindDto = z.infer<typeof journalLineRuleKindSchema>;

export const journalLineRulesSchema = z.object({
  accounts: z.array(
    z.object({
      accountId: z.string().uuid(),
      kind: journalLineRuleKindSchema,
      /** kind 'treasury': the treasuries whose money sits in the account (empty = none to pick). */
      treasuries: z.array(z.object({ id: z.string().uuid(), name: z.string(), currency: z.string() })),
    }),
  ),
});
export type JournalLineRulesDto = z.infer<typeof journalLineRulesSchema>;

/** GET /journal-entries/parties?kind= — the parties a manual line can name (accounting permission only). */
export const journalLinePartySchema = z.object({
  id: z.string().uuid(),
  code: z.string(),
  name: z.string(),
  phone: z.string().nullable(),
  isActive: z.boolean(),
});
export type JournalLinePartyDto = z.infer<typeof journalLinePartySchema>;

/** GET /ledger-integrity — "فحص سلامة البيانات": each control account against its sub-ledger. */
export const ledgerCheckKeySchema = z.enum([
  'customers',
  'notes_receivable',
  'suppliers',
  'notes_payable',
  'treasury',
  'inventory',
  'employee_advances',
  'salaries_payable',
]);
export type LedgerCheckKeyDto = z.infer<typeof ledgerCheckKeySchema>;

const signedMinorString = z.string().regex(/^-?\d+$/);

export const ledgerIntegrityRowSchema = z.object({
  key: ledgerCheckKeySchema,
  /** Treasury names for a treasury row; null = the key's own label. */
  label: z.string().nullable(),
  accountId: z.string().uuid().nullable(),
  accountCode: z.string().nullable(),
  accountName: z.string().nullable(),
  /** In the account's natural sense (an asset: debits − credits; a liability: credits − debits). */
  ledgerMinorUnits: signedMinorString,
  subledgerMinorUnits: signedMinorString,
  /** ledger − sub-ledger; 0 = they agree. */
  differenceMinorUnits: signedMinorString,
  /** Items in another currency left out of the sub-ledger figure. */
  foreignExcluded: z.number().int(),
  /** Posted manual lines on the account that name no party / treasury (or any manual line on a document-only account). */
  unexplained: z.object({
    count: z.number().int(),
    totalMinorUnits: signedMinorString,
    entries: z.array(z.object({ id: z.string().uuid(), number: z.string(), date: z.string(), amountMinorUnits: signedMinorString })),
  }),
  link: z.string().nullable(),
});
export type LedgerIntegrityRowDto = z.infer<typeof ledgerIntegrityRowSchema>;

export const ledgerIntegrityReportSchema = z.object({
  currency: z.string(),
  generatedAt: z.string(),
  rows: z.array(ledgerIntegrityRowSchema),
});
export type LedgerIntegrityReportDto = z.infer<typeof ledgerIntegrityReportSchema>;

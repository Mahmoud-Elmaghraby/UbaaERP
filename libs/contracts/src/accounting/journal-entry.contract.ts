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
  /** Bank reconciliation status (Stage 5) — see BankAccountsService. */
  isReconciled: z.boolean(),
  reconciledAt: z.coerce.date().nullable(),
  createdAt: z.coerce.date(),
});
export type JournalEntryLineDto = z.infer<typeof journalEntryLineSchema>;

export const journalEntrySchema = z.object({
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

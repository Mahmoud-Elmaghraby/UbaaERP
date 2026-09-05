import { z } from 'zod';
import { moneySchema } from '../inventory/money.contract';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected an ISO date (YYYY-MM-DD)');

/** Bank account (CLAUDE.md §10 — step 5, Accounting, Stage 5). See migration 0058's own comment. */
export const bankAccountSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  bankName: z.string().min(1),
  accountNumber: z.string().min(1),
  iban: z.string().nullable(),
  currency: z.string().regex(/^[A-Z]{3}$/, 'currency must be a three-letter ISO 4217 code'),
  chartOfAccountId: z.string().uuid(),
  openingBalance: moneySchema,
  openingBalanceDate: isoDate.nullable(),
  isActive: z.boolean(),
  notes: z.string().nullable(),
  customFields: z.record(z.unknown()),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type BankAccountDto = z.infer<typeof bankAccountSchema>;

export const createBankAccountSchema = z.object({
  name: z.string().min(1),
  bankName: z.string().min(1),
  accountNumber: z.string().min(1),
  iban: z.string().nullable().optional(),
  currency: z.string().regex(/^[A-Z]{3}$/, 'currency must be a three-letter ISO 4217 code'),
  chartOfAccountId: z.string().uuid(),
  openingBalanceMinorUnits: z
    .string()
    .regex(/^\d+$/, 'openingBalanceMinorUnits must be a non-negative integer string')
    .optional(),
  openingBalanceDate: isoDate.nullable().optional(),
  notes: z.string().nullable().optional(),
  customFields: z.record(z.unknown()).optional(),
});
export type CreateBankAccountDto = z.infer<typeof createBankAccountSchema>;

// chartOfAccountId/currency are deliberately absent — see
// UpdateBankAccountInput's own comment (domain/bank-account.entity.ts)
// for why they're immutable after creation.
export const updateBankAccountSchema = z.object({
  name: z.string().min(1).optional(),
  bankName: z.string().min(1).optional(),
  accountNumber: z.string().min(1).optional(),
  iban: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
  notes: z.string().nullable().optional(),
  customFields: z.record(z.unknown()).optional(),
});
export type UpdateBankAccountDto = z.infer<typeof updateBankAccountSchema>;

export const bankAccountRegisterLineSchema = z.object({
  id: z.string().uuid(),
  journalEntryId: z.string().uuid(),
  entryNumber: z.string(),
  entryDate: isoDate,
  description: z.string().nullable(),
  debitAmount: moneySchema,
  creditAmount: moneySchema,
  runningBalance: moneySchema,
  isReconciled: z.boolean(),
  reconciledAt: z.coerce.date().nullable(),
});
export type BankAccountRegisterLineDto = z.infer<typeof bankAccountRegisterLineSchema>;

export const bankAccountRegisterSchema = z.object({
  bankAccountId: z.string().uuid(),
  fromDate: isoDate.nullable(),
  toDate: isoDate.nullable(),
  openingBalance: moneySchema,
  lines: z.array(bankAccountRegisterLineSchema),
  closingBalance: moneySchema,
});
export type BankAccountRegisterDto = z.infer<typeof bankAccountRegisterSchema>;

import { z } from 'zod';
import { moneySchema } from '../inventory/money.contract';

/**
 * Treasury module (الخزائن): where money sits (cash boxes, banks, e-wallets),
 * expense / other-income / transfer vouchers, balances and statements.
 * Works without Accounting; with it, treasuries and expense/income items can
 * be linked to chart accounts and every movement is posted from events.
 */
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected an ISO date (YYYY-MM-DD)');
const currency = z.string().regex(/^[A-Z]{3}$/, 'currency must be a three-letter ISO 4217 code');
const nonNegativeMinor = z.string().regex(/^\d+$/, 'must be a non-negative integer string (minor units)');
const positiveMinor = z.string().regex(/^[1-9]\d*$/, 'must be a positive integer string (minor units)');

export const treasuryKindSchema = z.enum(['cash', 'bank', 'wallet']);
export type TreasuryKindDto = z.infer<typeof treasuryKindSchema>;

export const treasurySchema = z.object({
  id: z.string().uuid(),
  code: z.string(),
  name: z.string(),
  kind: treasuryKindSchema,
  currency: z.string(),
  bankName: z.string().nullable(),
  accountNumber: z.string().nullable(),
  iban: z.string().nullable(),
  chartOfAccountId: z.string().uuid().nullable(),
  openingBalance: moneySchema,
  openingBalanceDate: isoDate.nullable(),
  isActive: z.boolean(),
  isDefault: z.boolean(),
  notes: z.string().nullable(),
  /** Current balance (opening balance + every movement up to today). */
  balance: moneySchema,
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type TreasuryDto = z.infer<typeof treasurySchema>;

export const treasuryLookupSchema = z.object({
  id: z.string().uuid(),
  code: z.string(),
  name: z.string(),
  kind: treasuryKindSchema,
  currency: z.string(),
  isDefault: z.boolean(),
});
export type TreasuryLookupDto = z.infer<typeof treasuryLookupSchema>;

export const createTreasurySchema = z.object({
  code: z.string().trim().min(1).max(30),
  name: z.string().trim().min(1).max(120),
  kind: treasuryKindSchema,
  currency,
  bankName: z.string().trim().max(120).nullable().optional(),
  accountNumber: z.string().trim().max(60).nullable().optional(),
  iban: z.string().trim().max(60).nullable().optional(),
  chartOfAccountId: z.string().uuid().nullable().optional(),
  openingBalanceMinorUnits: nonNegativeMinor.optional(),
  openingBalanceDate: isoDate.nullable().optional(),
  isDefault: z.boolean().optional(),
  notes: z.string().nullable().optional(),
});
export type CreateTreasuryDto = z.infer<typeof createTreasurySchema>;

/** Kind and currency are fixed once a treasury exists (its movements are in that currency). */
export const updateTreasurySchema = createTreasurySchema
  .omit({ kind: true, currency: true })
  .partial()
  .extend({ isActive: z.boolean().optional() });
export type UpdateTreasuryDto = z.infer<typeof updateTreasurySchema>;

// ── expense / income items ───────────────────────────────────────────────
export const treasuryCategoryKindSchema = z.enum(['expense', 'income']);
export type TreasuryCategoryKindDto = z.infer<typeof treasuryCategoryKindSchema>;

export const treasuryCategorySchema = z.object({
  id: z.string().uuid(),
  kind: treasuryCategoryKindSchema,
  name: z.string(),
  chartOfAccountId: z.string().uuid().nullable(),
  isActive: z.boolean(),
});
export type TreasuryCategoryDto = z.infer<typeof treasuryCategorySchema>;

export const createTreasuryCategorySchema = z.object({
  kind: treasuryCategoryKindSchema,
  name: z.string().trim().min(1).max(120),
  chartOfAccountId: z.string().uuid().nullable().optional(),
});
export type CreateTreasuryCategoryDto = z.infer<typeof createTreasuryCategorySchema>;

export const updateTreasuryCategorySchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  chartOfAccountId: z.string().uuid().nullable().optional(),
  isActive: z.boolean().optional(),
});
export type UpdateTreasuryCategoryDto = z.infer<typeof updateTreasuryCategorySchema>;

// ── vouchers ─────────────────────────────────────────────────────────────
export const treasuryVoucherKindSchema = z.enum(['expense', 'income', 'transfer']);
export type TreasuryVoucherKindDto = z.infer<typeof treasuryVoucherKindSchema>;

export const treasuryVoucherSchema = z.object({
  id: z.string().uuid(),
  voucherNumber: z.string(),
  kind: treasuryVoucherKindSchema,
  status: z.enum(['posted', 'cancelled']),
  voucherDate: isoDate,
  treasuryId: z.string().uuid(),
  treasuryName: z.string(),
  toTreasuryId: z.string().uuid().nullable(),
  toTreasuryName: z.string().nullable(),
  categoryId: z.string().uuid().nullable(),
  categoryName: z.string().nullable(),
  amount: moneySchema,
  counterparty: z.string().nullable(),
  description: z.string().nullable(),
  reference: z.string().nullable(),
  createdAt: z.coerce.date(),
  cancelledAt: z.coerce.date().nullable(),
  cancelReason: z.string().nullable(),
});
export type TreasuryVoucherDto = z.infer<typeof treasuryVoucherSchema>;

export const createTreasuryVoucherSchema = z
  .object({
    kind: treasuryVoucherKindSchema,
    voucherDate: isoDate,
    /** Expense / transfer: paid from. Income: received into. */
    treasuryId: z.string().uuid(),
    toTreasuryId: z.string().uuid().nullable().optional(),
    categoryId: z.string().uuid().nullable().optional(),
    amountMinorUnits: positiveMinor,
    counterparty: z.string().trim().max(200).nullable().optional(),
    description: z.string().trim().max(1000).nullable().optional(),
    reference: z.string().trim().max(100).nullable().optional(),
  })
  .refine((v) => (v.kind === 'transfer' ? Boolean(v.toTreasuryId) : Boolean(v.categoryId)), {
    message: 'A transfer needs a destination treasury; an expense or income needs an item.',
    path: ['kind'],
  });
export type CreateTreasuryVoucherDto = z.infer<typeof createTreasuryVoucherSchema>;

export const cancelTreasuryVoucherSchema = z.object({ reason: z.string().trim().min(1).max(500) });
export type CancelTreasuryVoucherDto = z.infer<typeof cancelTreasuryVoucherSchema>;

export const treasuryVoucherQuerySchema = z.object({
  kind: treasuryVoucherKindSchema.optional(),
  treasuryId: z.string().uuid().optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
});
export type TreasuryVoucherQueryDto = z.infer<typeof treasuryVoucherQuerySchema>;

// ── statement ────────────────────────────────────────────────────────────
export const treasuryMovementKindSchema = z.enum([
  'opening_balance',
  'payment_received',
  'supplier_payment',
  'pos_variance',
  'expense',
  'income',
  'transfer_in',
  'transfer_out',
]);
export type TreasuryMovementKindDto = z.infer<typeof treasuryMovementKindSchema>;

export const treasuryStatementRowSchema = z.object({
  date: isoDate,
  kind: treasuryMovementKindSchema,
  documentId: z.string().nullable(),
  number: z.string(),
  counterparty: z.string().nullable(),
  description: z.string().nullable(),
  moneyIn: moneySchema,
  moneyOut: moneySchema,
  balance: moneySchema,
});
export type TreasuryStatementRowDto = z.infer<typeof treasuryStatementRowSchema>;

export const treasuryStatementSchema = z.object({
  treasury: treasuryLookupSchema,
  from: isoDate.nullable(),
  to: isoDate.nullable(),
  openingBalance: moneySchema,
  rows: z.array(treasuryStatementRowSchema),
  totalIn: moneySchema,
  totalOut: moneySchema,
  closingBalance: moneySchema,
});
export type TreasuryStatementDto = z.infer<typeof treasuryStatementSchema>;

export const treasuryStatementQuerySchema = z.object({ from: isoDate.optional(), to: isoDate.optional() });
export type TreasuryStatementQueryDto = z.infer<typeof treasuryStatementQuerySchema>;

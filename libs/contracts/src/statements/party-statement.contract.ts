import { z } from 'zod';
import { moneySchema } from '../inventory/money.contract';

/**
 * Customer / supplier account statement (كشف حساب) and aging, computed
 * from Sales / Purchases documents — available with or without the
 * Accounting module.
 *
 * Amounts follow the party's own sense: for a customer, `increase` = عليه
 * (invoices) and `decrease` = له (receipts, credit notes); for a supplier,
 * `increase` = له (purchase invoices) and `decrease` = عليه (payments).
 * `balance` > 0 means the customer owes us / we owe the supplier.
 */
export const partyLedgerKindSchema = z.enum([
  'opening_balance',
  'sales_invoice',
  'sales_credit_note',
  'payment_received',
  'purchase_invoice',
  'supplier_payment',
  'purchase_debit_note',
]);
export type PartyLedgerKindDto = z.infer<typeof partyLedgerKindSchema>;

export const partyStatementRowSchema = z.object({
  date: z.string(),
  kind: partyLedgerKindSchema,
  documentId: z.string().nullable(),
  number: z.string(),
  reference: z.string().nullable(),
  dueDate: z.string().nullable(),
  increase: moneySchema,
  decrease: moneySchema,
  balance: moneySchema,
});
export type PartyStatementRowDto = z.infer<typeof partyStatementRowSchema>;

export const partyKindSchema = z.enum(['customer', 'supplier']);
export type PartyKindDto = z.infer<typeof partyKindSchema>;

export const partyStatementSchema = z.object({
  partyKind: partyKindSchema,
  party: z.object({ id: z.string(), name: z.string(), code: z.string() }),
  currency: z.string(),
  /** Currencies this party has documents in (a statement is per currency). */
  currencies: z.array(z.string()),
  from: z.string().nullable(),
  to: z.string().nullable(),
  openingBalance: moneySchema,
  rows: z.array(partyStatementRowSchema),
  totalIncrease: moneySchema,
  totalDecrease: moneySchema,
  closingBalance: moneySchema,
});
export type PartyStatementDto = z.infer<typeof partyStatementSchema>;

export const partyStatementQuerySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  currency: z.string().regex(/^[A-Z]{3}$/).optional(),
});
export type PartyStatementQueryDto = z.infer<typeof partyStatementQuerySchema>;

export const agingBucketsSchema = z.object({
  current: moneySchema,
  days1To30: moneySchema,
  days31To60: moneySchema,
  days61To90: moneySchema,
  over90: moneySchema,
  total: moneySchema,
  /** Credit beyond everything owed (advance / overpayment). */
  unappliedCredit: moneySchema,
});
export type AgingBucketsDto = z.infer<typeof agingBucketsSchema>;

/** One party's line in the receivables/payables report (balances + aging). */
export const partyBalanceRowSchema = z.object({
  partyId: z.string(),
  name: z.string(),
  code: z.string(),
  phone: z.string().nullable(),
  currency: z.string(),
  /** Net balance (owed minus credit), as of `asOf`. */
  balance: moneySchema,
  aging: agingBucketsSchema,
  lastActivityDate: z.string().nullable(),
});
export type PartyBalanceRowDto = z.infer<typeof partyBalanceRowSchema>;

export const partyBalancesReportSchema = z.object({
  partyKind: partyKindSchema,
  asOf: z.string(),
  currency: z.string(),
  rows: z.array(partyBalanceRowSchema),
  totals: agingBucketsSchema.extend({ balance: moneySchema }),
});
export type PartyBalancesReportDto = z.infer<typeof partyBalancesReportSchema>;

export const partyBalancesQuerySchema = z.object({
  asOf: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  currency: z.string().regex(/^[A-Z]{3}$/).optional(),
  /** Hide parties with a zero balance (default true). */
  nonZeroOnly: z.enum(['true', 'false']).optional(),
});
export type PartyBalancesQueryDto = z.infer<typeof partyBalancesQuerySchema>;

/**
 * PUT /customers/:id/opening-balance and /suppliers/:id/opening-balance.
 * `amount` is a non-negative amount; `side` says which way it goes:
 * customer: 'owes_us' (مدين) | 'we_owe' (دائن); supplier: 'we_owe' (دائن) | 'owes_us' (مدين).
 */
export const setOpeningBalanceSchema = z.object({
  amount: z.object({
    amountMinorUnits: z.string().regex(/^\d+$/, 'amountMinorUnits must be a non-negative integer string'),
    currency: z.string().regex(/^[A-Z]{3}$/),
  }),
  side: z.enum(['owes_us', 'we_owe']),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
export type SetOpeningBalanceDto = z.infer<typeof setOpeningBalanceSchema>;

export const openingBalanceSchema = z.object({
  amount: moneySchema.nullable(),
  side: z.enum(['owes_us', 'we_owe']).nullable(),
  date: z.string().nullable(),
});
export type OpeningBalanceDto = z.infer<typeof openingBalanceSchema>;

import { z } from 'zod';
import { moneySchema, positiveMoneySchema } from '../inventory/money.contract';
import { paymentMethodSchema } from './payment-received.contract';
import { customerRefundSchema, refundMethodSchema } from './customer-refund.contract';
import { posCheckoutResultSchema, posCheckoutSchema } from './pos-sale.contract';

/** A supervisor's PIN typed on the till for an action the cashier can't do alone (migration 0113). */
export const approvalPinSchema = z.string().regex(/^\d{4,6}$/).nullable().optional();

/** A posted POS sale, as the till lists it (receipts of a shift / lookup for a return). */
export const posSaleSummarySchema = z.object({
  salesInvoiceId: z.string().uuid(),
  invoiceNumber: z.string(),
  createdAt: z.coerce.date(),
  customerId: z.string().uuid(),
  customerName: z.string(),
  total: moneySchema,
  tenders: z.array(z.object({ paymentMethod: paymentMethodSchema, amount: moneySchema })),
  /** Something was returned against this sale. */
  hasReturns: z.boolean(),
});
export type PosSaleSummaryDto = z.infer<typeof posSaleSummarySchema>;

/** One delivered line of a sale and how much of it can still come back. */
export const posReturnableLineSchema = z.object({
  deliveryLineId: z.string().uuid(),
  productVariantId: z.string().uuid(),
  productName: z.string(),
  sku: z.string().nullable(),
  quantity: z.number(),
  returnedQuantity: z.number(),
  returnableQuantity: z.number(),
  /** What one unit was actually charged (after every discount, VAT included) — the refund per unit. */
  unitAmount: moneySchema,
});
export type PosReturnableLineDto = z.infer<typeof posReturnableLineSchema>;

export const posSaleForReturnSchema = posSaleSummarySchema.extend({
  deliveryId: z.string().uuid(),
  lines: z.array(posReturnableLineSchema),
});
export type PosSaleForReturnDto = z.infer<typeof posSaleForReturnSchema>;

export const posReturnSchema = z.object({
  deliveryId: z.string().uuid(),
  lines: z
    .array(z.object({ deliveryLineId: z.string().uuid(), quantity: z.number().positive(), reason: z.string().max(200).nullable().optional() }))
    .min(1),
  /** Pay the customer back now; null keeps the amount as the customer's credit. */
  refund: z.object({ paymentMethod: refundMethodSchema, treasuryId: z.string().uuid().nullable().optional() }).nullable(),
  approvalPin: approvalPinSchema,
  notes: z.string().max(500).nullable().optional(),
});
export type PosReturnDto = z.infer<typeof posReturnSchema>;

export const posReturnResultSchema = z.object({
  salesReturnId: z.string().uuid(),
  returnNumber: z.string(),
  creditNoteId: z.string().uuid(),
  creditNoteNumber: z.string(),
  amount: moneySchema,
  refund: customerRefundSchema.nullable(),
});
export type PosReturnResultDto = z.infer<typeof posReturnResultSchema>;

/** A sale parked at the till; `payload` is the till's own cart, restored as-is. */
export const posHeldCartSchema = z.object({
  id: z.string().uuid(),
  label: z.string().nullable(),
  customerId: z.string().uuid().nullable(),
  customerName: z.string().nullable(),
  payload: z.record(z.unknown()),
  total: moneySchema,
  itemCount: z.number().int(),
  createdByName: z.string().nullable(),
  createdAt: z.coerce.date(),
});
export type PosHeldCartDto = z.infer<typeof posHeldCartSchema>;

export const holdPosCartSchema = z.object({
  label: z.string().trim().max(80).nullable().optional(),
  customerId: z.string().uuid().nullable().optional(),
  payload: z.record(z.unknown()).refine((p) => JSON.stringify(p).length <= 200_000, 'cart too large'),
  total: moneySchema,
  itemCount: z.number().int().min(0),
});
export type HoldPosCartDto = z.infer<typeof holdPosCartSchema>;

/**
 * Cash in / out of the drawer during a shift: an expense paid from it, cash
 * taken to the safe / bank, or change brought in from another treasury.
 */
export const posCashMovementSchema = z.object({
  kind: z.enum(['expense', 'to_treasury', 'from_treasury']),
  amount: positiveMoneySchema,
  /** Expense item — required for 'expense'. */
  categoryId: z.string().uuid().nullable().optional(),
  /** The safe / bank — required for the two transfers. */
  otherTreasuryId: z.string().uuid().nullable().optional(),
  description: z.string().max(300).nullable().optional(),
  approvalPin: approvalPinSchema,
});
export type PosCashMovementDto = z.infer<typeof posCashMovementSchema>;

export const posCashMovementRowSchema = z.object({
  id: z.string().uuid(),
  voucherNumber: z.string(),
  kind: z.enum(['expense', 'to_treasury', 'from_treasury']),
  status: z.enum(['posted', 'cancelled']),
  amount: moneySchema,
  categoryName: z.string().nullable(),
  otherTreasuryName: z.string().nullable(),
  description: z.string().nullable(),
  createdAt: z.coerce.date(),
});
export type PosCashMovementRowDto = z.infer<typeof posCashMovementRowSchema>;

/**
 * استبدال — a return and a new sale in one go (clothing client: a customer swaps a size). The
 * returned items' value pays for the new sale; the cashier's tenders cover only what is left, and
 * when the return is worth more, the rest goes back to the customer in cash.
 */
export const posExchangeSchema = z.object({
  return: posReturnSchema.omit({ refund: true, approvalPin: true }),
  sale: posCheckoutSchema,
});
export type PosExchangeDto = z.infer<typeof posExchangeSchema>;

export const posExchangeResultSchema = z.object({
  return: posReturnResultSchema,
  sale: posCheckoutResultSchema,
  /** What the returned items were worth (the credit note). */
  creditAmount: moneySchema,
  /** > 0 the customer paid this on top; < 0 this went back to the customer; 0 an even swap. */
  balance: z.object({ amountMinorUnits: z.string(), currency: z.string() }),
});
export type PosExchangeResultDto = z.infer<typeof posExchangeResultSchema>;

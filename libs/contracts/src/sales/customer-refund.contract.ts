import { z } from 'zod';
import { moneySchema, positiveMoneySchema } from '../inventory/money.contract';

/** How a refund is paid out (no cheques: a refund leaves a treasury now). */
export const refundMethodSchema = z.enum(['cash', 'bank_transfer', 'card', 'other']);
export type RefundMethodDto = z.infer<typeof refundMethodSchema>;

/**
 * رد مبلغ لعميل (migration 0113) — money paid back to a customer: a POS
 * return refunded at the till, or a credit balance paid out. Posted on
 * creation; corrected by cancelling with a reason.
 */
export const customerRefundSchema = z.object({
  id: z.string().uuid(),
  refundNumber: z.string(),
  customerId: z.string().uuid(),
  customerName: z.string(),
  status: z.enum(['posted', 'cancelled']),
  refundDate: z.string(),
  paymentMethod: refundMethodSchema,
  treasuryId: z.string().uuid().nullable(),
  treasuryName: z.string().nullable(),
  amount: moneySchema,
  salesCreditNoteId: z.string().uuid().nullable(),
  posSessionId: z.string().uuid().nullable(),
  reference: z.string().nullable(),
  notes: z.string().nullable(),
  createdAt: z.coerce.date(),
  cancelledAt: z.coerce.date().nullable(),
  cancelReason: z.string().nullable(),
});
export type CustomerRefundDto = z.infer<typeof customerRefundSchema>;

export const createCustomerRefundSchema = z.object({
  customerId: z.string().uuid(),
  amount: positiveMoneySchema,
  paymentMethod: refundMethodSchema,
  /** Where the money leaves from; cash defaults to the main cash box of the currency. */
  treasuryId: z.string().uuid().nullable().optional(),
  refundDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  /** The credit note this refund pays out, if any. */
  salesCreditNoteId: z.string().uuid().nullable().optional(),
  reference: z.string().max(120).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
});
export type CreateCustomerRefundDto = z.infer<typeof createCustomerRefundSchema>;

export const cancelCustomerRefundSchema = z.object({ reason: z.string().trim().min(1).max(500) });
export type CancelCustomerRefundDto = z.infer<typeof cancelCustomerRefundSchema>;

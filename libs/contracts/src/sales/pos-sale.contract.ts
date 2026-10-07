import { z } from 'zod';
import { moneySchema } from '../inventory/money.contract';
import { createDiscountableSchema, salesOrderWithLinesSchema } from './sales-order.contract';
import { paymentMethodSchema, paymentReceivedWithAllocationsSchema } from './payment-received.contract';
import { deliveryWithLinesSchema } from './delivery.contract';
import { salesInvoiceWithLinesSchema } from './sales-invoice.contract';

/**
 * POS Checkout (CLAUDE.md §10 — step 4, Sales — POS feature, Stage 3;
 * see claude/sales-pos-research.md §4 and pos-sale.entity.ts's own
 * comment). Not a persisted document's own contract — the request/
 * response shape for PosSalesService.checkout(), composed entirely of
 * the existing Sales Order/Delivery/Sales Invoice/Payment Received
 * contracts plus the same discount fields Sales Order already uses.
 */
export const posCheckoutLineSchema = z
  .object({
    productVariantId: z.string().uuid(),
    /** Line unit (carton, sack…); omitted/null = the product's base unit. */
    unitOfMeasureId: z.string().uuid().nullable().optional(),
    quantity: z.number().positive(),
    unitPrice: moneySchema,
    notes: z.string().nullable().optional(),
  })
  .merge(createDiscountableSchema);
export type PosCheckoutLineDto = z.infer<typeof posCheckoutLineSchema>;

export const posCheckoutTenderSchema = z.object({
  paymentMethod: paymentMethodSchema,
  amount: moneySchema,
  referenceNumber: z.string().nullable().optional(),
});
export type PosCheckoutTenderDto = z.infer<typeof posCheckoutTenderSchema>;

export const posCheckoutSchema = z
  .object({
    customerId: z.string().uuid().nullable().optional(),
    lines: z.array(posCheckoutLineSchema).min(1),
    tenders: z.array(posCheckoutTenderSchema).min(1),
    notes: z.string().nullable().optional(),
  })
  .merge(createDiscountableSchema);
export type PosCheckoutDto = z.infer<typeof posCheckoutSchema>;

export const posCheckoutResultSchema = z.object({
  salesOrder: salesOrderWithLinesSchema,
  delivery: deliveryWithLinesSchema,
  salesInvoice: salesInvoiceWithLinesSchema,
  payments: z.array(paymentReceivedWithAllocationsSchema),
});
export type PosCheckoutResultDto = z.infer<typeof posCheckoutResultSchema>;

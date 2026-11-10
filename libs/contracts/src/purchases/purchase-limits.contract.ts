import { z } from 'zod';

/**
 * GET /purchase-orders/:id/limits-check and /purchase-invoices/:id/limits-check — what the settings
 * hub's purchases limits say about a draft before it is confirmed / posted (settings hub phase 3).
 * The web explains and asks; the API enforces the same check on confirm / post.
 */
export const purchasePriceIncreaseSchema = z.object({
  lineId: z.string(),
  productVariantId: z.string(),
  productName: z.string(),
  /** Per base unit, decimal strings. */
  unitPrice: z.string(),
  lastPrice: z.string(),
  currency: z.string(),
  increasePercent: z.number(),
  lastDocument: z.string(),
});
export type PurchasePriceIncreaseDto = z.infer<typeof purchasePriceIncreaseSchema>;

export const purchaseLimitsCheckSchema = z.object({
  /** The order total reaches 'purchases.orderApprovalAmount' (in the company currency). */
  approvalRequired: z.boolean(),
  approvalAmount: z.string().nullable(),
  companyCurrency: z.string(),
  priceIncreaseMode: z.enum(['allow', 'warn', 'block']),
  priceIncreaseTolerance: z.number(),
  priceIncreases: z.array(purchasePriceIncreaseSchema),
  /** A supplier invoice number is required and missing (invoices only). */
  supplierInvoiceNumberMissing: z.boolean(),
  /** The user holds 'purchases.approve'. */
  canApprove: z.boolean(),
  needsConfirmation: z.boolean(),
  blocked: z.boolean(),
});
export type PurchaseLimitsCheckDto = z.infer<typeof purchaseLimitsCheckSchema>;

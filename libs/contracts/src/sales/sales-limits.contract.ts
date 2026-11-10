import { z } from 'zod';

/**
 * GET /sales-orders/:id/limits-check and /sales-invoices/:id/limits-check — what the settings hub's
 * sales limits say about a draft before it is confirmed / posted (settings hub phase 2). The web
 * shows the warnings and asks first; the API enforces the same check on confirm / post.
 */
export const priceViolationSchema = z.object({
  lineId: z.string(),
  productVariantId: z.string(),
  productName: z.string(),
  kind: z.enum(['below_cost', 'below_min']),
  /** Price per base unit after discounts, decimal string. */
  unitNet: z.string(),
  /** The minimum price (decimal string); null for cost, which is shown only to who may see costs. */
  floor: z.string().nullable(),
  currency: z.string(),
});
export type PriceViolationDto = z.infer<typeof priceViolationSchema>;

export const salesLimitsCheckSchema = z.object({
  /** Deepest discount on the document (%), and the limit (null = none). */
  discountPercent: z.number(),
  discountLimit: z.number().nullable(),
  discountExceeded: z.boolean(),
  belowCostMode: z.enum(['allow', 'warn', 'block']),
  belowMinPriceMode: z.enum(['allow', 'warn', 'block']),
  violations: z.array(priceViolationSchema),
  /** A sales rep is required and the document has none. */
  repMissing: z.boolean(),
  /** The user holds 'sales.override_limits'. */
  canOverride: z.boolean(),
  /** Something to confirm first (warn-mode prices, or a limit this user may override). */
  needsConfirmation: z.boolean(),
  /** Confirming / posting will be refused for this user. */
  blocked: z.boolean(),
});
export type SalesLimitsCheckDto = z.infer<typeof salesLimitsCheckSchema>;

import { z } from 'zod';

const currencySchema = z.string().regex(/^[A-Z]{3}$/, 'currency must be a three-letter ISO 4217 code');
/** Decimal text, up to 3 places (quantities) — never a float on the wire. */
const quantityTextSchema = z.string().regex(/^\d+(\.\d{1,3})?$/, 'Must be a non-negative number');
const percentTextSchema = z
  .string()
  .regex(/^\d+(\.\d{1,2})?$/, 'Must be a non-negative number')
  .refine((v) => Number(v) <= 100, 'Must be 100 or less');

/** One fixed price: a product (all its variants) or one variant, from a minimum quantity in base units. */
export const priceListItemSchema = z.object({
  id: z.string().uuid(),
  productId: z.string().uuid(),
  /** Null = every variant of the product. */
  productVariantId: z.string().uuid().nullable(),
  minQuantity: quantityTextSchema,
  /** Minor units, in the list's currency. */
  priceAmountMinorUnits: z.string().regex(/^\d+$/),
});
export type PriceListItemDto = z.infer<typeof priceListItemSchema>;

/** 'sale': customers and sales documents; 'purchase': suppliers and purchase documents (migration 0115). */
export const priceListKindSchema = z.enum(['sale', 'purchase']);
export type PriceListKindDto = z.infer<typeof priceListKindSchema>;

export const priceListSummarySchema = z.object({
  id: z.string().uuid(),
  kind: priceListKindSchema.default('sale'),
  name: z.string(),
  currency: z.string(),
  /** General discount off the normal sale (or purchase) price, for items without a fixed price ("0" = none). */
  discountPercent: z.string(),
  isActive: z.boolean(),
  notes: z.string().nullable(),
  itemCount: z.number().int(),
  customerCount: z.number().int(),
  supplierCount: z.number().int().default(0),
});
export type PriceListSummaryDto = z.infer<typeof priceListSummarySchema>;

export const priceListSchema = priceListSummarySchema.extend({
  items: z.array(priceListItemSchema),
});
export type PriceListDto = z.infer<typeof priceListSchema>;

export const savePriceListItemSchema = z.object({
  productId: z.string().uuid(),
  productVariantId: z.string().uuid().nullable().optional(),
  minQuantity: quantityTextSchema.optional(),
  priceAmountMinorUnits: z.string().regex(/^\d+$/, 'amountMinorUnits must be a non-negative integer string'),
});
export type SavePriceListItemDto = z.infer<typeof savePriceListItemSchema>;

/** Header + the full item set (replaces the list's items). */
export const savePriceListSchema = z.object({
  name: z.string().trim().min(1).max(80),
  currency: currencySchema,
  discountPercent: percentTextSchema.optional(),
  isActive: z.boolean().optional(),
  notes: z.string().trim().max(500).nullable().optional(),
  items: z.array(savePriceListItemSchema).max(20000),
});
export type SavePriceListDto = z.infer<typeof savePriceListSchema>;

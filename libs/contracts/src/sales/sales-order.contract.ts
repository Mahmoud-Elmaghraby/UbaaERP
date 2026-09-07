import { z } from 'zod';
import { moneySchema } from '../inventory/money.contract';

export const salesOrderStatusSchema = z.enum([
  'draft',
  'confirmed',
  'partially_delivered',
  'fully_delivered',
  'cancelled',
]);
export type SalesOrderStatusDto = z.infer<typeof salesOrderStatusSchema>;

/** POS feature Stage 2 (claude/sales-pos-research.md) — a discount is either a percentage (0-100) or a fixed Money amount, never both. */
export const discountTypeSchema = z.enum(['percentage', 'fixed']);
export type DiscountTypeDto = z.infer<typeof discountTypeSchema>;

const discountableSchema = z.object({
  discountType: discountTypeSchema.nullable(),
  discountPercentage: z.number().min(0).max(100).nullable(),
  discountFixedAmount: moneySchema.nullable(),
});

/** Exported for pos-sale.contract.ts (POS feature Stage 3) — checkout's header/line discount fields reuse this exact shape rather than redefining it. */
export const createDiscountableSchema = z.object({
  discountType: discountTypeSchema.nullable().optional(),
  discountPercentage: z.number().min(0).max(100).nullable().optional(),
  discountFixedAmount: moneySchema.nullable().optional(),
});

export const salesOrderLineSchema = z
  .object({
    id: z.string().uuid(),
    salesOrderId: z.string().uuid(),
    productVariantId: z.string().uuid(),
    quantity: z.number().positive(),
    unitPrice: moneySchema,
    notes: z.string().nullable(),
    createdAt: z.coerce.date(),
  })
  .merge(discountableSchema);
export type SalesOrderLineDto = z.infer<typeof salesOrderLineSchema>;

export const salesOrderSchema = z
  .object({
    id: z.string().uuid(),
    soNumber: z.string().min(1),
    customerId: z.string().uuid(),
    sourceQuotationId: z.string().uuid().nullable(),
    status: salesOrderStatusSchema,
    /** Populated from the order's own lines at creation (migration 0062) — null only for orders created before that migration. */
    currency: z.string().regex(/^[A-Z]{3}$/).nullable(),
    notes: z.string().nullable(),
    customFields: z.record(z.unknown()),
    createdAt: z.coerce.date(),
    updatedAt: z.coerce.date(),
  })
  .merge(discountableSchema);
export type SalesOrderDto = z.infer<typeof salesOrderSchema>;

export const salesOrderWithLinesSchema = salesOrderSchema.extend({
  lines: z.array(salesOrderLineSchema),
  /** Sum of each line's net-of-line-discount amount, BEFORE the header-level discount. */
  subtotalAmount: moneySchema,
  /** subtotalAmount with the header-level discount (if any) applied — the actual amount owed. */
  totalAmount: moneySchema,
});
export type SalesOrderWithLinesDto = z.infer<typeof salesOrderWithLinesSchema>;

export const createSalesOrderLineSchema = z
  .object({
    productVariantId: z.string().uuid(),
    quantity: z.number().positive(),
    unitPrice: moneySchema,
    notes: z.string().nullable().optional(),
  })
  .merge(createDiscountableSchema);
export type CreateSalesOrderLineDto = z.infer<typeof createSalesOrderLineSchema>;

export const createSalesOrderSchema = z
  .object({
    sourceQuotationId: z.string().uuid().nullable().optional(),
    customerId: z.string().uuid().optional(),
    lines: z.array(createSalesOrderLineSchema).min(1).optional(),
    notes: z.string().nullable().optional(),
    customFields: z.record(z.unknown()).optional(),
  })
  .merge(createDiscountableSchema);
export type CreateSalesOrderDto = z.infer<typeof createSalesOrderSchema>;

export const updateSalesOrderSchema = z
  .object({
    notes: z.string().nullable().optional(),
    customFields: z.record(z.unknown()).optional(),
    lines: z.array(createSalesOrderLineSchema).min(1).optional(),
  })
  .merge(createDiscountableSchema);
export type UpdateSalesOrderDto = z.infer<typeof updateSalesOrderSchema>;

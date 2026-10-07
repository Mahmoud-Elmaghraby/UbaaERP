import { z } from 'zod';
import { moneySchema, nonNegativeMoneySchema } from './money.contract';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const stockCountKindSchema = z.enum(['opening', 'stocktake']);
export type StockCountKindDto = z.infer<typeof stockCountKindSchema>;
export const stockCountStatusSchema = z.enum(['draft', 'posted', 'cancelled']);
export type StockCountStatusDto = z.infer<typeof stockCountStatusSchema>;

export const stockCountSchema = z.object({
  id: z.string().uuid(),
  countNumber: z.string(),
  kind: stockCountKindSchema,
  warehouseId: z.string().uuid(),
  status: stockCountStatusSchema,
  countDate: z.string().nullable(),
  notes: z.string().nullable(),
  createdBy: z.string().uuid().nullable(),
  postedBy: z.string().uuid().nullable(),
  postedAt: z.coerce.date().nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type StockCountDto = z.infer<typeof stockCountSchema>;

export const stockCountLineSchema = z.object({
  id: z.string().uuid(),
  stockCountId: z.string().uuid(),
  productVariantId: z.string().uuid(),
  locationId: z.string().uuid(),
  lotNumber: z.string().nullable(),
  expiryDate: z.string().nullable(),
  systemQuantity: z.number(),
  countedQuantity: z.number().nullable(),
  unitCost: moneySchema.nullable(),
});
export type StockCountLineDto = z.infer<typeof stockCountLineSchema>;

export const stockCountWithLinesSchema = stockCountSchema.extend({ lines: z.array(stockCountLineSchema) });
export type StockCountWithLinesDto = z.infer<typeof stockCountWithLinesSchema>;

export const createStockCountSchema = z.object({
  kind: stockCountKindSchema,
  warehouseId: z.string().uuid(),
  countDate: isoDate.nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});
export type CreateStockCountDto = z.infer<typeof createStockCountSchema>;

export const updateStockCountSchema = z.object({
  countDate: isoDate.nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});
export type UpdateStockCountDto = z.infer<typeof updateStockCountSchema>;

export const upsertStockCountLineSchema = z.object({
  productVariantId: z.string().uuid(),
  locationId: z.string().uuid().optional(),
  lotNumber: z.string().trim().max(100).nullable().optional(),
  expiryDate: isoDate.nullable().optional(),
  countedQuantity: z.number().min(0).nullable(),
  unitCost: nonNegativeMoneySchema.nullable().optional(),
});
export type UpsertStockCountLineDto = z.infer<typeof upsertStockCountLineSchema>;

export const upsertStockCountLinesSchema = z.object({
  lines: z.array(upsertStockCountLineSchema).min(1).max(5000),
});
export type UpsertStockCountLinesDto = z.infer<typeof upsertStockCountLinesSchema>;

export const loadStockCountSchema = z.object({
  categoryIds: z.array(z.string().uuid()).max(500).optional(),
});
export type LoadStockCountDto = z.infer<typeof loadStockCountSchema>;

/** كارت الصنف */
export const itemCardMovementSchema = z.object({
  id: z.string().uuid(),
  createdAt: z.coerce.date(),
  warehouseId: z.string().uuid(),
  movementType: z.string(),
  quantity: z.number(),
  balance: z.number(),
  unitCost: moneySchema.nullable(),
  referenceType: z.string().nullable(),
  referenceId: z.string().nullable(),
  referenceNumber: z.string().nullable(),
  lotNumber: z.string().nullable(),
  notes: z.string().nullable(),
});
export type ItemCardMovementDto = z.infer<typeof itemCardMovementSchema>;

export const itemCardSchema = z.object({
  productVariantId: z.string().uuid(),
  warehouseId: z.string().uuid().nullable(),
  openingQuantity: z.number(),
  closingQuantity: z.number(),
  totalIn: z.number(),
  totalOut: z.number(),
  truncated: z.boolean(),
  movements: z.array(itemCardMovementSchema),
});
export type ItemCardDto = z.infer<typeof itemCardSchema>;

export const stockValuationRowSchema = z.object({
  productVariantId: z.string().uuid(),
  productName: z.string(),
  productCode: z.string(),
  sku: z.string(),
  categoryId: z.string().uuid().nullable(),
  warehouseId: z.string().uuid(),
  warehouseName: z.string(),
  quantity: z.number(),
  value: moneySchema,
});
export type StockValuationRowDto = z.infer<typeof stockValuationRowSchema>;

/** Month-end reconciliation: stock (shelves + in transit) vs the ledger's inventory account. */
export const stockValuationSummarySchema = z.object({
  stockValue: z.string(),
  inTransitValue: z.string(),
  /** Null when no inventory account is mapped in Accounting settings. */
  ledgerBalance: z.string().nullable(),
  /** stock + in transit − ledger; null without a ledger balance. */
  difference: z.string().nullable(),
});
export type StockValuationSummaryDto = z.infer<typeof stockValuationSummarySchema>;

export const lowStockRowSchema = z.object({
  productVariantId: z.string().uuid(),
  productName: z.string(),
  productCode: z.string(),
  sku: z.string(),
  warehouseId: z.string().uuid(),
  warehouseName: z.string(),
  locationId: z.string().uuid(),
  quantity: z.number(),
  reorderPoint: z.number(),
});
export type LowStockRowDto = z.infer<typeof lowStockRowSchema>;

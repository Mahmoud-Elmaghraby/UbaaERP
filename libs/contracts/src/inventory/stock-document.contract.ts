import { z } from 'zod';
import { moneySchema, nonNegativeMoneySchema } from './money.contract';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

// ---- Warehouse transfers (migration 0083) ---------------------------------

export const stockTransferStatusSchema = z.enum(['draft', 'in_transit', 'received', 'cancelled']);
export type StockTransferStatusDto = z.infer<typeof stockTransferStatusSchema>;

export const stockTransferSchema = z.object({
  id: z.string().uuid(),
  transferNumber: z.string(),
  status: stockTransferStatusSchema,
  fromWarehouseId: z.string().uuid(),
  fromLocationId: z.string().uuid(),
  toWarehouseId: z.string().uuid(),
  toLocationId: z.string().uuid(),
  transferDate: z.string(),
  notes: z.string().nullable(),
  createdBy: z.string().uuid().nullable(),
  dispatchedBy: z.string().uuid().nullable(),
  dispatchedAt: z.coerce.date().nullable(),
  receivedBy: z.string().uuid().nullable(),
  receivedAt: z.coerce.date().nullable(),
  cancelledBy: z.string().uuid().nullable(),
  cancelledAt: z.coerce.date().nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type StockTransferDto = z.infer<typeof stockTransferSchema>;

export const transferLotSchema = z.object({
  lotNumber: z.string().trim().min(1).max(100),
  quantity: z.number().positive(),
});

export const stockTransferLineSchema = z.object({
  id: z.string().uuid(),
  lineNumber: z.number().int(),
  productVariantId: z.string().uuid(),
  quantity: z.number(),
  unitOfMeasureId: z.string().uuid().nullable(),
  unitFactor: z.number(),
  lots: z.array(transferLotSchema),
  /** Base units that left the source (0 until dispatched). */
  dispatchedQuantity: z.number(),
  /** Null when the caller lacks inventory.costs.view, or before dispatch. */
  dispatchedValue: moneySchema.nullable(),
  /** Base units received; null until received. */
  receivedQuantity: z.number().nullable(),
  notes: z.string().nullable(),
});
export type StockTransferLineDto = z.infer<typeof stockTransferLineSchema>;

export const stockTransferWithLinesSchema = stockTransferSchema.extend({ lines: z.array(stockTransferLineSchema) });
export type StockTransferWithLinesDto = z.infer<typeof stockTransferWithLinesSchema>;

export const stockTransferLineInputSchema = z.object({
  productVariantId: z.string().uuid(),
  quantity: z.number().positive(),
  unitOfMeasureId: z.string().uuid().nullable().optional(),
  lots: z.array(transferLotSchema).max(500).optional(),
  notes: z.string().max(500).nullable().optional(),
});

export const createStockTransferSchema = z.object({
  fromWarehouseId: z.string().uuid(),
  fromLocationId: z.string().uuid().nullable().optional(),
  toWarehouseId: z.string().uuid(),
  toLocationId: z.string().uuid().nullable().optional(),
  transferDate: isoDate.nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  lines: z.array(stockTransferLineInputSchema).min(1).max(1000),
});
export type CreateStockTransferDto = z.infer<typeof createStockTransferSchema>;

export const updateStockTransferSchema = createStockTransferSchema.partial();
export type UpdateStockTransferDto = z.infer<typeof updateStockTransferSchema>;

export const receiveStockTransferSchema = z.object({
  lines: z
    .array(z.object({ lineId: z.string().uuid(), receivedQuantity: z.number().min(0) }))
    .max(1000)
    .optional(),
});
export type ReceiveStockTransferDto = z.infer<typeof receiveStockTransferSchema>;

export const inTransitValueSchema = z.object({
  toWarehouseId: z.string().uuid(),
  transfers: z.number().int(),
  value: moneySchema,
});
export type InTransitValueDto = z.infer<typeof inTransitValueSchema>;

// ---- Stock adjustments & reasons (migration 0084) -------------------------

export const reasonDirectionSchema = z.enum(['increase', 'decrease', 'both']);
export const adjustmentDirectionSchema = z.enum(['increase', 'decrease']);

export const stockAdjustmentReasonSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  direction: reasonDirectionSchema,
  accountId: z.string().uuid().nullable(),
  isActive: z.boolean(),
  sortOrder: z.number().int(),
});
export type StockAdjustmentReasonDto = z.infer<typeof stockAdjustmentReasonSchema>;

export const createStockAdjustmentReasonSchema = z.object({
  name: z.string().trim().min(1).max(100),
  direction: reasonDirectionSchema.optional(),
  accountId: z.string().uuid().nullable().optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(100000).optional(),
});
export type CreateStockAdjustmentReasonDto = z.infer<typeof createStockAdjustmentReasonSchema>;
export const updateStockAdjustmentReasonSchema = createStockAdjustmentReasonSchema.partial();
export type UpdateStockAdjustmentReasonDto = z.infer<typeof updateStockAdjustmentReasonSchema>;

export const stockAdjustmentStatusSchema = z.enum(['draft', 'posted', 'cancelled']);
export type StockAdjustmentStatusDto = z.infer<typeof stockAdjustmentStatusSchema>;

export const stockAdjustmentSchema = z.object({
  id: z.string().uuid(),
  adjustmentNumber: z.string(),
  status: stockAdjustmentStatusSchema,
  warehouseId: z.string().uuid(),
  locationId: z.string().uuid(),
  reasonId: z.string().uuid().nullable(),
  adjustmentDate: z.string(),
  notes: z.string().nullable(),
  createdBy: z.string().uuid().nullable(),
  postedBy: z.string().uuid().nullable(),
  postedAt: z.coerce.date().nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type StockAdjustmentDto = z.infer<typeof stockAdjustmentSchema>;

export const stockAdjustmentLineSchema = z.object({
  id: z.string().uuid(),
  lineNumber: z.number().int(),
  productVariantId: z.string().uuid(),
  direction: adjustmentDirectionSchema,
  quantity: z.number(),
  unitOfMeasureId: z.string().uuid().nullable(),
  unitFactor: z.number(),
  /** Null when the caller lacks inventory.costs.view. */
  unitCost: moneySchema.nullable(),
  lotNumber: z.string().nullable(),
  expiryDate: z.string().nullable(),
  reasonId: z.string().uuid().nullable(),
  postedValue: moneySchema.nullable(),
  notes: z.string().nullable(),
});
export type StockAdjustmentLineDto = z.infer<typeof stockAdjustmentLineSchema>;

export const stockAdjustmentWithLinesSchema = stockAdjustmentSchema.extend({
  lines: z.array(stockAdjustmentLineSchema),
});
export type StockAdjustmentWithLinesDto = z.infer<typeof stockAdjustmentWithLinesSchema>;

export const stockAdjustmentLineInputSchema = z.object({
  productVariantId: z.string().uuid(),
  direction: adjustmentDirectionSchema,
  quantity: z.number().positive(),
  unitOfMeasureId: z.string().uuid().nullable().optional(),
  unitCost: nonNegativeMoneySchema.nullable().optional(),
  lotNumber: z.string().trim().max(100).nullable().optional(),
  expiryDate: isoDate.nullable().optional(),
  reasonId: z.string().uuid().nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
});

export const createStockAdjustmentSchema = z.object({
  warehouseId: z.string().uuid(),
  locationId: z.string().uuid().nullable().optional(),
  reasonId: z.string().uuid().nullable().optional(),
  adjustmentDate: isoDate.nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  lines: z.array(stockAdjustmentLineInputSchema).min(1).max(2000),
  /** Post right away (one step) instead of saving a draft. */
  post: z.boolean().optional(),
});
export type CreateStockAdjustmentDto = z.infer<typeof createStockAdjustmentSchema>;
export const updateStockAdjustmentSchema = createStockAdjustmentSchema.omit({ post: true }).partial();
export type UpdateStockAdjustmentDto = z.infer<typeof updateStockAdjustmentSchema>;

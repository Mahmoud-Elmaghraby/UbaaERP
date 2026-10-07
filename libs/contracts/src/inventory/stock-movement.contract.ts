import { z } from 'zod';
import { moneySchema } from './money.contract';

export const stockMovementTypeSchema = z.enum([
  'in',
  'out',
  'transfer_in',
  'transfer_out',
  'adjustment_increase',
  'adjustment_decrease',
]);
export type StockMovementTypeDto = z.infer<typeof stockMovementTypeSchema>;

export const directStockMovementTypeSchema = z.enum(['in', 'out', 'adjustment_increase', 'adjustment_decrease']);

export const stockMovementSchema = z.object({
  id: z.string().uuid(),
  productVariantId: z.string().uuid(),
  locationId: z.string().uuid(),
  warehouseId: z.string().uuid(),
  movementType: stockMovementTypeSchema,
  quantity: z.number().positive(),
  unitCost: moneySchema.nullable(),
  resultingAverageCost: moneySchema.nullable(),
  referenceType: z.string().nullable(),
  referenceId: z.string().nullable(),
  /** Readable source document number and its customer/supplier (list endpoint only). */
  referenceNumber: z.string().nullable().optional(),
  partyName: z.string().nullable().optional(),
  relatedMovementId: z.string().uuid().nullable(),
  stockLotId: z.string().uuid().nullable(),
  notes: z.string().nullable(),
  createdBy: z.string().uuid().nullable(),
  createdAt: z.coerce.date(),
});
export type StockMovementDto = z.infer<typeof stockMovementSchema>;

// Input cost: a stock unit cost can never be negative (inventory audit
// 2026-10, H7) — the service enforces the same rule for internal callers.
const moneyInputSchema = z.object({
  amountMinorUnits: z.string().regex(/^\d+$/, 'amountMinorUnits must be a non-negative integer string'),
  currency: z.string().regex(/^[A-Z]{3}$/),
});

export const recordStockMovementSchema = z.object({
  productVariantId: z.string().uuid(),
  locationId: z.string().uuid(),
  movementType: directStockMovementTypeSchema,
  /** In `unitOfMeasureId` when given, otherwise already in the product's own (base) unit of measure. */
  quantity: z.number().positive(),
  /** Optional purchase/sale unit (e.g. recording a movement in "box"); converted server-side to the product's own unit. */
  unitOfMeasureId: z.string().uuid().optional(),
  unitCost: moneyInputSchema.optional(),
  /** Required for a lot/serial-tracked product's 'in'/'adjustment_increase' movement: the lot/serial number to receive into (created if new). */
  lotNumber: z.string().min(1).optional(),
  /** Lot-tracked products only: sets the lot's expiry date on first receipt of a new lot number. */
  expiryDate: z.coerce.date().nullable().optional(),
  /** Outgoing movements on a lot/serial-tracked product: consume from this specific lot instead of FIFO-by-expiry. */
  lotId: z.string().uuid().optional(),
  referenceType: z.string().nullable().optional(),
  referenceId: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  /** Why (stock adjustment reason, migration 0084) — drives the journal entry's counter-account. */
  reasonId: z.string().uuid().nullable().optional(),
});
export type RecordStockMovementDto = z.infer<typeof recordStockMovementSchema>;

export const transferStockSchema = z.object({
  productVariantId: z.string().uuid(),
  quantity: z.number().positive(),
  fromLocationId: z.string().uuid(),
  toLocationId: z.string().uuid(),
  /** Required when the product is lot/serial tracked: which lot to move. */
  lotId: z.string().uuid().optional(),
  notes: z.string().nullable().optional(),
});
export type TransferStockDto = z.infer<typeof transferStockSchema>;

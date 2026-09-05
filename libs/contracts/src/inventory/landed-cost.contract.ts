import { z } from 'zod';
import { moneySchema } from './money.contract';

export const landedCostAllocationMethodSchema = z.enum(['by_quantity', 'by_value']);
export type LandedCostAllocationMethodDto = z.infer<typeof landedCostAllocationMethodSchema>;

export const landedCostAllocationSchema = z.object({
  id: z.string().uuid(),
  landedCostId: z.string().uuid(),
  stockMovementId: z.string().uuid(),
  productVariantId: z.string().uuid(),
  locationId: z.string().uuid(),
  warehouseId: z.string().uuid(),
  allocatedAmount: moneySchema,
  resultingAverageCost: moneySchema,
  createdAt: z.coerce.date(),
});
export type LandedCostAllocationDto = z.infer<typeof landedCostAllocationSchema>;

export const landedCostSchema = z.object({
  id: z.string().uuid(),
  totalCost: moneySchema,
  allocationMethod: landedCostAllocationMethodSchema,
  referenceType: z.string().nullable(),
  referenceId: z.string().nullable(),
  notes: z.string().nullable(),
  createdBy: z.string().uuid().nullable(),
  createdAt: z.coerce.date(),
  allocations: z.array(landedCostAllocationSchema),
});
export type LandedCostDto = z.infer<typeof landedCostSchema>;

export const applyLandedCostSchema = z.object({
  totalCost: moneySchema,
  allocationMethod: landedCostAllocationMethodSchema,
  stockMovementIds: z.array(z.string().uuid()).min(1),
  referenceType: z.string().nullable().optional(),
  referenceId: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});
export type ApplyLandedCostDto = z.infer<typeof applyLandedCostSchema>;

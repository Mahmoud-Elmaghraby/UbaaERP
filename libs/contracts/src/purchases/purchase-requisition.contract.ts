import { z } from 'zod';

export const purchaseRequisitionStatusSchema = z.enum([
  'draft',
  'submitted',
  'approved',
  'rejected',
  'cancelled',
]);
export type PurchaseRequisitionStatusDto = z.infer<typeof purchaseRequisitionStatusSchema>;

export const purchaseRequisitionLineSchema = z.object({
  id: z.string().uuid(),
  requisitionId: z.string().uuid(),
  productVariantId: z.string().uuid(),
  quantity: z.number().positive(),
  notes: z.string().nullable(),
  createdAt: z.coerce.date(),
});
export type PurchaseRequisitionLineDto = z.infer<typeof purchaseRequisitionLineSchema>;

export const purchaseRequisitionSchema = z.object({
  id: z.string().uuid(),
  requisitionNumber: z.string().min(1),
  requestedBy: z.string().uuid(),
  branchId: z.string().uuid().nullable(),
  status: purchaseRequisitionStatusSchema,
  neededByDate: z.string().nullable(),
  notes: z.string().nullable(),
  customFields: z.record(z.unknown()),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type PurchaseRequisitionDto = z.infer<typeof purchaseRequisitionSchema>;

export const purchaseRequisitionWithLinesSchema = purchaseRequisitionSchema.extend({
  lines: z.array(purchaseRequisitionLineSchema),
});
export type PurchaseRequisitionWithLinesDto = z.infer<typeof purchaseRequisitionWithLinesSchema>;

export const createPurchaseRequisitionLineSchema = z.object({
  productVariantId: z.string().uuid(),
  quantity: z.number().positive(),
  notes: z.string().nullable().optional(),
});
export type CreatePurchaseRequisitionLineDto = z.infer<typeof createPurchaseRequisitionLineSchema>;

export const createPurchaseRequisitionSchema = z.object({
  branchId: z.string().uuid().nullable().optional(),
  neededByDate: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  customFields: z.record(z.unknown()).optional(),
  lines: z.array(createPurchaseRequisitionLineSchema).min(1),
});
export type CreatePurchaseRequisitionDto = z.infer<typeof createPurchaseRequisitionSchema>;

export const updatePurchaseRequisitionSchema = z.object({
  branchId: z.string().uuid().nullable().optional(),
  neededByDate: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  customFields: z.record(z.unknown()).optional(),
  lines: z.array(createPurchaseRequisitionLineSchema).min(1).optional(),
});
export type UpdatePurchaseRequisitionDto = z.infer<typeof updatePurchaseRequisitionSchema>;

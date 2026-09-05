import { z } from 'zod';

export const deliveryStatusSchema = z.enum(['draft', 'confirmed', 'cancelled']);
export type DeliveryStatusDto = z.infer<typeof deliveryStatusSchema>;

export const deliveryLineSchema = z.object({
  id: z.string().uuid(),
  deliveryId: z.string().uuid(),
  salesOrderLineId: z.string().uuid(),
  productVariantId: z.string().uuid(),
  quantityDelivered: z.number().positive(),
  notes: z.string().nullable(),
  createdAt: z.coerce.date(),
});
export type DeliveryLineDto = z.infer<typeof deliveryLineSchema>;

export const deliverySchema = z.object({
  id: z.string().uuid(),
  deliveryNumber: z.string().min(1),
  salesOrderId: z.string().uuid(),
  warehouseId: z.string().uuid(),
  status: deliveryStatusSchema,
  deliveryDate: z.string().nullable(),
  notes: z.string().nullable(),
  customFields: z.record(z.unknown()),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type DeliveryDto = z.infer<typeof deliverySchema>;

export const deliveryWithLinesSchema = deliverySchema.extend({
  lines: z.array(deliveryLineSchema),
});
export type DeliveryWithLinesDto = z.infer<typeof deliveryWithLinesSchema>;

export const createDeliveryLineSchema = z.object({
  salesOrderLineId: z.string().uuid(),
  quantityDelivered: z.number().positive(),
  notes: z.string().nullable().optional(),
});
export type CreateDeliveryLineDto = z.infer<typeof createDeliveryLineSchema>;

export const createDeliverySchema = z.object({
  salesOrderId: z.string().uuid(),
  warehouseId: z.string().uuid(),
  lines: z.array(createDeliveryLineSchema).min(1),
  deliveryDate: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  customFields: z.record(z.unknown()).optional(),
});
export type CreateDeliveryDto = z.infer<typeof createDeliverySchema>;

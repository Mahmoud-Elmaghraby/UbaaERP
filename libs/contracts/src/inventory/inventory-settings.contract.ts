import { z } from 'zod';

export const itemCodeModeSchema = z.enum(['manual', 'auto']);
export const barcodeModeSchema = z.enum(['manual', 'auto']);

/** Inventory module settings (Settings › Modules › Inventory). */
export const scaleValueTypeSchema = z.enum(['weight', 'price']);

export const inventorySettingsSchema = z.object({
  itemCodeMode: itemCodeModeSchema,
  barcodeMode: barcodeModeSchema,
  barcodePrefix: z.string(),
  /** Scale (weighing-machine) EAN-13: prefix + item code + embedded weight/price + check digit. */
  scaleBarcodeEnabled: z.boolean(),
  scaleBarcodePrefix: z.string(),
  scaleItemCodeLength: z.number().int(),
  scaleValueType: scaleValueTypeSchema,
  scaleValueDecimals: z.number().int(),
  /** Unit of a new product when none is chosen — migration 0097. */
  defaultUnitOfMeasureId: z.string().uuid().nullable(),
  updatedAt: z.coerce.date(),
});
export type InventorySettingsDto = z.infer<typeof inventorySettingsSchema>;

export const updateInventorySettingsSchema = z
  .object({
    itemCodeMode: itemCodeModeSchema,
    barcodeMode: barcodeModeSchema,
    /** 1–7 digits; default "2" (GS1 in-store range 20–29). */
    barcodePrefix: z.string().regex(/^[0-9]{1,7}$/),
    scaleBarcodeEnabled: z.boolean(),
    scaleBarcodePrefix: z.string().regex(/^[0-9]{1,3}$/),
    scaleItemCodeLength: z.number().int().min(3).max(7),
    scaleValueType: scaleValueTypeSchema,
    scaleValueDecimals: z.number().int().min(0).max(3),
    defaultUnitOfMeasureId: z.string().uuid().nullable(),
  })
  .partial();
export type UpdateInventorySettingsDto = z.infer<typeof updateInventorySettingsSchema>;

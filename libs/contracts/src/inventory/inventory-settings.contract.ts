import { z } from 'zod';

export const itemCodeModeSchema = z.enum(['manual', 'auto']);
export const barcodeModeSchema = z.enum(['manual', 'auto']);

/** Inventory module settings (Settings › Modules › Inventory). */
export const inventorySettingsSchema = z.object({
  itemCodeMode: itemCodeModeSchema,
  barcodeMode: barcodeModeSchema,
  barcodePrefix: z.string(),
  updatedAt: z.coerce.date(),
});
export type InventorySettingsDto = z.infer<typeof inventorySettingsSchema>;

export const updateInventorySettingsSchema = z
  .object({
    itemCodeMode: itemCodeModeSchema,
    barcodeMode: barcodeModeSchema,
    /** 1–7 digits; default "2" (GS1 in-store range 20–29). */
    barcodePrefix: z.string().regex(/^[0-9]{1,7}$/),
  })
  .partial();
export type UpdateInventorySettingsDto = z.infer<typeof updateInventorySettingsSchema>;

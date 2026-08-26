import { z } from 'zod';

export const taxRuleSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  rate: z.number().min(0).max(100),
  isActive: z.boolean(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type TaxRuleDto = z.infer<typeof taxRuleSchema>;

export const createTaxRuleSchema = z.object({
  name: z.string().min(1),
  rate: z.number().min(0).max(100),
  isActive: z.boolean().optional(),
});
export type CreateTaxRuleDto = z.infer<typeof createTaxRuleSchema>;

export const updateTaxRuleSchema = createTaxRuleSchema.partial();
export type UpdateTaxRuleDto = z.infer<typeof updateTaxRuleSchema>;

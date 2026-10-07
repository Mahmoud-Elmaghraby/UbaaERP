import { z } from 'zod';

export const supplierSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  code: z.string().min(1),
  contactPerson: z.string().nullable(),
  email: z.string().email().nullable(),
  phone: z.string().nullable(),
  address: z.string().nullable(),
  taxNumber: z.string().nullable(),
  withholdingTaxRuleId: z.string().uuid().nullable(),
  defaultCurrency: z.string().regex(/^[A-Z]{3}$/, 'defaultCurrency must be a three-letter ISO 4217 code'),
  paymentTermsDays: z.number().int().nonnegative().nullable(),
  notes: z.string().nullable(),
  isActive: z.boolean(),
  customFields: z.record(z.unknown()),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type SupplierDto = z.infer<typeof supplierSchema>;

export const createSupplierSchema = z.object({
  name: z.string().min(1),
  code: z.string().min(1),
  contactPerson: z.string().nullable().optional(),
  email: z.string().email().nullable().optional(),
  phone: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  taxNumber: z.string().nullable().optional(),
  withholdingTaxRuleId: z.string().uuid().nullable().optional(),
  defaultCurrency: z.string().regex(/^[A-Z]{3}$/, 'defaultCurrency must be a three-letter ISO 4217 code'),
  paymentTermsDays: z.number().int().nonnegative().nullable().optional(),
  notes: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
  customFields: z.record(z.unknown()).optional(),
});
export type CreateSupplierDto = z.infer<typeof createSupplierSchema>;

export const updateSupplierSchema = createSupplierSchema.partial();
export type UpdateSupplierDto = z.infer<typeof updateSupplierSchema>;

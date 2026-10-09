import { z } from 'zod';

export const customerTypeSchema = z.enum(['business', 'individual']);

export const customerSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  code: z.string().min(1),
  customerType: customerTypeSchema,
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
  /** POS feature Stage 2 — read-only; never settable via createCustomerSchema/updateCustomerSchema. */
  isSystemDefault: z.boolean(),
  customFields: z.record(z.unknown()),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type CustomerDto = z.infer<typeof customerSchema>;

export const createCustomerSchema = z.object({
  name: z.string().min(1),
  /** Empty → the next automatic code (Settings › Numbering). */
  code: z.string().trim().optional(),
  customerType: customerTypeSchema.optional(),
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
export type CreateCustomerDto = z.infer<typeof createCustomerSchema>;

export const updateCustomerSchema = createCustomerSchema.partial();
export type UpdateCustomerDto = z.infer<typeof updateCustomerSchema>;

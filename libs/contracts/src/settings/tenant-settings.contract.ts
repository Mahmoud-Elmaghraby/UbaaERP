import { z } from 'zod';

/**
 * Shared Zod contracts (CLAUDE.md §2.9 — [مقترح]): imported verbatim by
 * apps/api (request validation) and, later, apps/web (zodResolver). This
 * is the first real content in @erp-platform/contracts.
 */
export const tenantSettingsSchema = z.object({
  id: z.string().uuid(),
  currencyCode: z.string().length(3),
  companyName: z.string().nullable(),
  address: z.string().nullable(),
  taxRegistrationNumber: z.string().nullable(),
  commercialRegister: z.string().nullable(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  website: z.string().nullable(),
  /** Presigned URL of the company logo (null = none). */
  logoUrl: z.string().nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type TenantSettingsDto = z.infer<typeof tenantSettingsSchema>;

export const updateTenantSettingsSchema = z.object({
  currencyCode: z.string().length(3).optional(),
  companyName: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  taxRegistrationNumber: z.string().nullable().optional(),
  commercialRegister: z.string().max(100).nullable().optional(),
  phone: z.string().max(100).nullable().optional(),
  email: z.string().max(200).nullable().optional(),
  website: z.string().max(200).nullable().optional(),
});
export type UpdateTenantSettingsDto = z.infer<typeof updateTenantSettingsSchema>;

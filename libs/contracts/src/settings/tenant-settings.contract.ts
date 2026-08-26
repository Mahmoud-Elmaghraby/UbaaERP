import { z } from 'zod';

/**
 * Shared Zod contracts (CLAUDE.md §2.9 — [مقترح]): imported verbatim by
 * apps/api (request validation) and, later, apps/web (zodResolver). This
 * is the first real content in @erp-platform/contracts.
 */
export const tenantSettingsSchema = z.object({
  id: z.string().uuid(),
  currencyCode: z.string().length(3),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type TenantSettingsDto = z.infer<typeof tenantSettingsSchema>;

export const updateTenantSettingsSchema = z.object({
  currencyCode: z.string().length(3).optional(),
});
export type UpdateTenantSettingsDto = z.infer<typeof updateTenantSettingsSchema>;

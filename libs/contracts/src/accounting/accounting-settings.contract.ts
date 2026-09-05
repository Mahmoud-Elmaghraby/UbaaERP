import { z } from 'zod';

/**
 * Default-account mapping (CLAUDE.md §10 — step 5, Accounting, Stages
 * 6/7 and 3). See migration 0052's own comment for the original four
 * fields, and migration 0054's for revenueAccountId/
 * accountsPayableAccountId/purchaseExpenseAccountId (Sales/Purchases
 * invoice auto-posting), and migration 0061's for cashAccountId/
 * cashOverShortAccountId (POS feature Stage 1) — a true singleton,
 * GET+PATCH only, same shape as tenantSettingsSchema.
 */
export const accountingSettingsSchema = z.object({
  id: z.string().uuid(),
  accountsReceivableAccountId: z.string().uuid().nullable(),
  inventoryAccountId: z.string().uuid().nullable(),
  cogsAccountId: z.string().uuid().nullable(),
  salesReturnsContraAccountId: z.string().uuid().nullable(),
  revenueAccountId: z.string().uuid().nullable(),
  accountsPayableAccountId: z.string().uuid().nullable(),
  purchaseExpenseAccountId: z.string().uuid().nullable(),
  cashAccountId: z.string().uuid().nullable(),
  cashOverShortAccountId: z.string().uuid().nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type AccountingSettingsDto = z.infer<typeof accountingSettingsSchema>;

export const updateAccountingSettingsSchema = z.object({
  accountsReceivableAccountId: z.string().uuid().nullable().optional(),
  inventoryAccountId: z.string().uuid().nullable().optional(),
  cogsAccountId: z.string().uuid().nullable().optional(),
  salesReturnsContraAccountId: z.string().uuid().nullable().optional(),
  revenueAccountId: z.string().uuid().nullable().optional(),
  accountsPayableAccountId: z.string().uuid().nullable().optional(),
  purchaseExpenseAccountId: z.string().uuid().nullable().optional(),
  cashAccountId: z.string().uuid().nullable().optional(),
  cashOverShortAccountId: z.string().uuid().nullable().optional(),
});
export type UpdateAccountingSettingsDto = z.infer<typeof updateAccountingSettingsSchema>;

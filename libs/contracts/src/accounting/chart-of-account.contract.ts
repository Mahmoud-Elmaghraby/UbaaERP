import { z } from 'zod';

export const accountTypeSchema = z.enum(['asset', 'liability', 'equity', 'revenue', 'expense']);
export type AccountType = z.infer<typeof accountTypeSchema>;

export const normalBalanceSchema = z.enum(['debit', 'credit']);
export type NormalBalance = z.infer<typeof normalBalanceSchema>;

export const chartOfAccountSchema = z.object({
  id: z.string().uuid(),
  code: z.string().min(1),
  name: z.string().min(1),
  accountType: accountTypeSchema,
  normalBalance: normalBalanceSchema,
  parentId: z.string().uuid().nullable(),
  isGroup: z.boolean(),
  isSystem: z.boolean(),
  isActive: z.boolean(),
  notes: z.string().nullable(),
  customFields: z.record(z.unknown()),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type ChartOfAccountDto = z.infer<typeof chartOfAccountSchema>;

export const createChartOfAccountSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  accountType: accountTypeSchema,
  normalBalance: normalBalanceSchema,
  parentId: z.string().uuid().nullable().optional(),
  isGroup: z.boolean().optional(),
  notes: z.string().nullable().optional(),
  customFields: z.record(z.unknown()).optional(),
});
export type CreateChartOfAccountDto = z.infer<typeof createChartOfAccountSchema>;

// Deliberately narrower than createChartOfAccountSchema.partial(): code/
// accountType/normalBalance/parentId/isGroup are immutable after creation
// (ChartOfAccountsService — changing an account's type or place in the
// tree after it may already be in use would silently corrupt reporting).
// Renaming (code, name), deactivating, and custom fields remain editable,
// matching the master doc's "fully editable afterward" for the seeded
// template (root accounts excepted — see the service's own guard).
export const updateChartOfAccountSchema = z.object({
  code: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
  isActive: z.boolean().optional(),
  notes: z.string().nullable().optional(),
  customFields: z.record(z.unknown()).optional(),
});
export type UpdateChartOfAccountDto = z.infer<typeof updateChartOfAccountSchema>;

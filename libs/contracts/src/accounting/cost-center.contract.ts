import { z } from 'zod';

/** Cost center (CLAUDE.md §10 — step 5, Accounting, Stage 4). See migration 0055's own comment — a flat tagging dimension. */
export const costCenterSchema = z.object({
  id: z.string().uuid(),
  code: z.string().min(1),
  name: z.string().min(1),
  isActive: z.boolean(),
  notes: z.string().nullable(),
  customFields: z.record(z.unknown()),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type CostCenterDto = z.infer<typeof costCenterSchema>;

export const createCostCenterSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  notes: z.string().nullable().optional(),
  customFields: z.record(z.unknown()).optional(),
});
export type CreateCostCenterDto = z.infer<typeof createCostCenterSchema>;

// Fully editable, unlike updateChartOfAccountSchema — a cost center has
// no tree position or type to protect, so code/name/isActive/notes/
// customFields are all editable after creation.
export const updateCostCenterSchema = z.object({
  code: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
  isActive: z.boolean().optional(),
  notes: z.string().nullable().optional(),
  customFields: z.record(z.unknown()).optional(),
});
export type UpdateCostCenterDto = z.infer<typeof updateCostCenterSchema>;

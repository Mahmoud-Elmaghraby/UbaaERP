import { z } from 'zod';

export const branchSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  code: z.string().min(1),
  address: z.string().nullable(),
  isActive: z.boolean(),
  customFields: z.record(z.unknown()),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type BranchDto = z.infer<typeof branchSchema>;

export const createBranchSchema = z.object({
  name: z.string().min(1),
  code: z.string().min(1),
  address: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
  customFields: z.record(z.unknown()).optional(),
});
export type CreateBranchDto = z.infer<typeof createBranchSchema>;

export const updateBranchSchema = createBranchSchema.partial();
export type UpdateBranchDto = z.infer<typeof updateBranchSchema>;

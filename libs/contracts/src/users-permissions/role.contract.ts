import { z } from 'zod';

export const roleSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  isSystem: z.boolean(),
  permissionKeys: z.array(z.string()),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type RoleDto = z.infer<typeof roleSchema>;

export const createRoleSchema = z.object({
  name: z.string().min(1),
  permissionKeys: z.array(z.string()).default([]),
});
export type CreateRoleDto = z.infer<typeof createRoleSchema>;

export const updateRoleSchema = z.object({
  name: z.string().min(1).optional(),
  permissionKeys: z.array(z.string()).optional(),
});
export type UpdateRoleDto = z.infer<typeof updateRoleSchema>;

import { z } from 'zod';

export const userSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  fullName: z.string().min(1),
  roleId: z.string().uuid(),
  isActive: z.boolean(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type UserDto = z.infer<typeof userSchema>;

export const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  fullName: z.string().min(1),
  roleId: z.string().uuid(),
  isActive: z.boolean().optional(),
});
export type CreateUserDto = z.infer<typeof createUserSchema>;

export const updateUserSchema = z.object({
  fullName: z.string().min(1).optional(),
  roleId: z.string().uuid().optional(),
  isActive: z.boolean().optional(),
});
export type UpdateUserDto = z.infer<typeof updateUserSchema>;

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8),
});
export type ChangePasswordDto = z.infer<typeof changePasswordSchema>;

export const setBranchAccessSchema = z.object({
  branchIds: z.array(z.string().uuid()),
});
export type SetBranchAccessDto = z.infer<typeof setBranchAccessSchema>;

export const setManagerSchema = z.object({
  managerId: z.string().uuid().nullable(),
});
export type SetManagerDto = z.infer<typeof setManagerSchema>;

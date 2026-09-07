import { z } from 'zod';

/**
 * Single source of truth for password complexity (CLAUDE.md §2.9 —
 * shared Zod contracts, backend + frontend). Previously both
 * createUserSchema.password and changePasswordSchema.newPassword only
 * checked length (min 8) — no complexity requirement at all. Kept
 * deliberately simple (length + the three standard character classes,
 * no special-character requirement, no dictionary/breach check) rather
 * than an aggressive policy that mostly just annoys real users; this is
 * a floor, not a full password-strength product.
 */
export const strongPassword = z
  .string()
  .min(8, 'Password must be at least 8 characters.')
  .max(128, 'Password must be at most 128 characters.')
  .refine((value) => /[a-z]/.test(value), 'Password must contain at least one lowercase letter.')
  .refine((value) => /[A-Z]/.test(value), 'Password must contain at least one uppercase letter.')
  .refine((value) => /[0-9]/.test(value), 'Password must contain at least one digit.');

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
  password: strongPassword,
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
  newPassword: strongPassword,
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

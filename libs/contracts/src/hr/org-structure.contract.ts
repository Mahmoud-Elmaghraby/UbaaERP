import { z } from 'zod';

/** A department (إدارة / قسم). Departments form a tree through parentId. */
export const hrDepartmentSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  parentId: z.string().uuid().nullable(),
  parentName: z.string().nullable(),
  /** The department head (an employee). */
  managerId: z.string().uuid().nullable(),
  managerName: z.string().nullable(),
  isActive: z.boolean(),
  /** Active employees directly in this department. */
  employeeCount: z.number().int(),
});
export type HrDepartmentDto = z.infer<typeof hrDepartmentSchema>;

export const saveHrDepartmentSchema = z.object({
  name: z.string().trim().min(1).max(80),
  parentId: z.string().uuid().nullable().optional(),
  managerId: z.string().uuid().nullable().optional(),
  isActive: z.boolean().optional(),
});
export type SaveHrDepartmentDto = z.infer<typeof saveHrDepartmentSchema>;

/** A job title (المسمى الوظيفي). */
export const hrJobTitleSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  description: z.string().nullable(),
  isActive: z.boolean(),
  employeeCount: z.number().int(),
});
export type HrJobTitleDto = z.infer<typeof hrJobTitleSchema>;

export const saveHrJobTitleSchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(500).nullable().optional(),
  isActive: z.boolean().optional(),
});
export type SaveHrJobTitleDto = z.infer<typeof saveHrJobTitleSchema>;

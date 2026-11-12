import { z } from 'zod';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const optionalText = (max: number) => z.string().trim().max(max).nullable().optional();

export const employeeStatusSchema = z.enum(['active', 'suspended', 'terminated']);
export type EmployeeStatusDto = z.infer<typeof employeeStatusSchema>;

export const employmentTypeSchema = z.enum(['full_time', 'part_time', 'temporary', 'trainee']);
export type EmploymentTypeDto = z.infer<typeof employmentTypeSchema>;

/** How the salary reaches the employee. */
export const salaryPaymentMethodSchema = z.enum(['cash', 'bank', 'wallet']);
export type SalaryPaymentMethodDto = z.infer<typeof salaryPaymentMethodSchema>;

export const genderSchema = z.enum(['male', 'female']);
export type GenderDto = z.infer<typeof genderSchema>;

/** One row of the employees list. */
export const employeeSummarySchema = z.object({
  id: z.string().uuid(),
  code: z.string(),
  fullName: z.string(),
  phone: z.string().nullable(),
  branchId: z.string().uuid().nullable(),
  branchName: z.string().nullable(),
  departmentId: z.string().uuid().nullable(),
  departmentName: z.string().nullable(),
  jobTitleId: z.string().uuid().nullable(),
  jobTitleName: z.string().nullable(),
  managerId: z.string().uuid().nullable(),
  managerName: z.string().nullable(),
  hireDate: isoDate,
  employmentType: employmentTypeSchema,
  status: employeeStatusSchema,
});
export type EmployeeSummaryDto = z.infer<typeof employeeSummarySchema>;

/** The employee file (ملف الموظف). */
export const employeeSchema = employeeSummarySchema.extend({
  nationalId: z.string().nullable(),
  nationalIdExpiry: isoDate.nullable(),
  gender: genderSchema.nullable(),
  birthDate: isoDate.nullable(),
  email: z.string().nullable(),
  address: z.string().nullable(),
  emergencyContactName: z.string().nullable(),
  emergencyContactPhone: z.string().nullable(),
  userId: z.string().uuid().nullable(),
  userName: z.string().nullable(),
  /** The work shift; null = the default shift. */
  shiftId: z.string().uuid().nullable(),
  shiftName: z.string().nullable(),
  /** The employee's number on the fingerprint device, when it isn't the employee code. */
  attendanceCode: z.string().nullable(),
  terminationDate: isoDate.nullable(),
  terminationReason: z.string().nullable(),
  paymentMethod: salaryPaymentMethodSchema,
  bankName: z.string().nullable(),
  bankAccount: z.string().nullable(),
  notes: z.string().nullable(),
  customFields: z.record(z.unknown()),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type EmployeeDto = z.infer<typeof employeeSchema>;

export const saveEmployeeSchema = z.object({
  /** Empty = the next 'employee' number (Settings › Numbering). */
  code: optionalText(30),
  fullName: z.string().trim().min(2).max(120),
  nationalId: optionalText(30),
  nationalIdExpiry: isoDate.nullable().optional(),
  gender: genderSchema.nullable().optional(),
  birthDate: isoDate.nullable().optional(),
  phone: optionalText(30),
  email: z.string().trim().email().max(120).nullable().optional().or(z.literal('').transform(() => null)),
  address: optionalText(300),
  emergencyContactName: optionalText(120),
  emergencyContactPhone: optionalText(30),
  branchId: z.string().uuid().nullable().optional(),
  departmentId: z.string().uuid().nullable().optional(),
  jobTitleId: z.string().uuid().nullable().optional(),
  managerId: z.string().uuid().nullable().optional(),
  userId: z.string().uuid().nullable().optional(),
  shiftId: z.string().uuid().nullable().optional(),
  attendanceCode: optionalText(30),
  hireDate: isoDate,
  employmentType: employmentTypeSchema.default('full_time'),
  paymentMethod: salaryPaymentMethodSchema.default('cash'),
  bankName: optionalText(80),
  bankAccount: optionalText(60),
  notes: optionalText(2000),
  customFields: z.record(z.unknown()).optional(),
});
export type SaveEmployeeDto = z.infer<typeof saveEmployeeSchema>;

/** Suspend, reactivate or end service. Ending service needs a date (and usually a reason). */
export const changeEmployeeStatusSchema = z
  .object({
    status: employeeStatusSchema,
    terminationDate: isoDate.nullable().optional(),
    terminationReason: optionalText(300),
  })
  .refine((v) => v.status !== 'terminated' || Boolean(v.terminationDate), {
    message: 'terminationDate is required to end service',
    path: ['terminationDate'],
  });
export type ChangeEmployeeStatusDto = z.infer<typeof changeEmployeeStatusSchema>;

export const employeeListQuerySchema = z.object({
  status: employeeStatusSchema.optional(),
  branchId: z.string().uuid().optional(),
  departmentId: z.string().uuid().optional(),
  jobTitleId: z.string().uuid().optional(),
  search: z.string().trim().max(80).optional(),
});
export type EmployeeListQueryDto = z.infer<typeof employeeListQuerySchema>;

import { z } from 'zod';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const minorUnits = z.string().regex(/^\d+$/);

/** Earning (بدل) adds to the salary; deduction (استقطاع) takes from it. */
export const salaryComponentKindSchema = z.enum(['earning', 'deduction']);
export type SalaryComponentKindDto = z.infer<typeof salaryComponentKindSchema>;

/** A fixed amount, or a percentage of the basic salary. */
export const salaryComponentCalculationSchema = z.enum(['fixed', 'percent_of_basic']);
export type SalaryComponentCalculationDto = z.infer<typeof salaryComponentCalculationSchema>;

/** A recurring salary component (بدل سكن، بدل انتقال، استقطاع تأمين…). */
export const salaryComponentSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  kind: salaryComponentKindSchema,
  calculation: salaryComponentCalculationSchema,
  /** The suggested value when added to an employee: minor units (fixed) or null. */
  defaultAmountMinorUnits: minorUnits.nullable(),
  /** The suggested percentage (percent_of_basic) or null. */
  defaultPercent: z.number().nullable(),
  isActive: z.boolean(),
  /** Employees with it on any salary revision. */
  employeeCount: z.number().int(),
});
export type SalaryComponentDto = z.infer<typeof salaryComponentSchema>;

export const saveSalaryComponentSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    kind: salaryComponentKindSchema,
    calculation: salaryComponentCalculationSchema,
    defaultAmountMinorUnits: minorUnits.nullable().optional(),
    defaultPercent: z.number().min(0).max(1000).nullable().optional(),
    isActive: z.boolean().optional(),
  })
  .refine((v) => v.calculation === 'fixed' || v.defaultAmountMinorUnits == null, {
    message: 'A percentage component has no fixed amount',
    path: ['defaultAmountMinorUnits'],
  })
  .refine((v) => v.calculation === 'percent_of_basic' || v.defaultPercent == null, {
    message: 'A fixed component has no percentage',
    path: ['defaultPercent'],
  });
export type SaveSalaryComponentDto = z.infer<typeof saveSalaryComponentSchema>;

/** One component on an employee's salary, with the amount it comes to. */
export const employeeSalaryLineSchema = z.object({
  componentId: z.string().uuid(),
  componentName: z.string(),
  kind: salaryComponentKindSchema,
  calculation: salaryComponentCalculationSchema,
  /** As entered: minor units (fixed) or null. */
  amountMinorUnits: minorUnits.nullable(),
  /** As entered: percentage (percent_of_basic) or null. */
  percent: z.number().nullable(),
  /** What it comes to this month, minor units. */
  valueMinorUnits: minorUnits,
});
export type EmployeeSalaryLineDto = z.infer<typeof employeeSalaryLineSchema>;

/** One salary revision, in force from `effectiveFrom` until the next one. */
export const employeeSalarySchema = z.object({
  id: z.string().uuid(),
  employeeId: z.string().uuid(),
  effectiveFrom: isoDate,
  /** The next revision's date (exclusive end), null for the latest. */
  effectiveTo: isoDate.nullable(),
  basicMinorUnits: minorUnits,
  lines: z.array(employeeSalaryLineSchema),
  earningsMinorUnits: minorUnits,
  deductionsMinorUnits: minorUnits,
  /** Basic + earnings. */
  grossMinorUnits: minorUnits,
  /** Gross − deductions (never below zero). */
  netMinorUnits: minorUnits,
  currency: z.string(),
  notes: z.string().nullable(),
  createdAt: z.string(),
  createdByName: z.string().nullable(),
});
export type EmployeeSalaryDto = z.infer<typeof employeeSalarySchema>;

/** Salary history, newest first, with the one in force today. */
export const employeeSalaryHistorySchema = z.object({
  current: employeeSalarySchema.nullable(),
  history: z.array(employeeSalarySchema),
});
export type EmployeeSalaryHistoryDto = z.infer<typeof employeeSalaryHistorySchema>;

export const saveEmployeeSalarySchema = z.object({
  effectiveFrom: isoDate,
  basicMinorUnits: minorUnits,
  lines: z
    .array(
      z.object({
        componentId: z.string().uuid(),
        amountMinorUnits: minorUnits.nullable().optional(),
        percent: z.number().min(0).max(1000).nullable().optional(),
      }),
    )
    .max(50)
    .default([])
    .refine((lines) => new Set(lines.map((l) => l.componentId)).size === lines.length, {
      message: 'A component appears twice',
    }),
  notes: z.string().trim().max(500).nullable().optional(),
});
export type SaveEmployeeSalaryDto = z.infer<typeof saveEmployeeSalarySchema>;

/** The salaries register: every employee's salary in force on a date. */
export const salaryRegisterRowSchema = z.object({
  employeeId: z.string().uuid(),
  code: z.string(),
  fullName: z.string(),
  departmentName: z.string().nullable(),
  jobTitleName: z.string().nullable(),
  status: z.enum(['active', 'suspended', 'terminated']),
  /** Null when the employee has no salary yet on that date. */
  effectiveFrom: isoDate.nullable(),
  basicMinorUnits: minorUnits.nullable(),
  earningsMinorUnits: minorUnits.nullable(),
  deductionsMinorUnits: minorUnits.nullable(),
  netMinorUnits: minorUnits.nullable(),
});
export type SalaryRegisterRowDto = z.infer<typeof salaryRegisterRowSchema>;

export const salaryRegisterSchema = z.object({
  asOf: isoDate,
  currency: z.string(),
  rows: z.array(salaryRegisterRowSchema),
  totals: z.object({
    basicMinorUnits: minorUnits,
    earningsMinorUnits: minorUnits,
    deductionsMinorUnits: minorUnits,
    netMinorUnits: minorUnits,
  }),
  /** Employees in the list without any salary on that date. */
  withoutSalary: z.number().int(),
});
export type SalaryRegisterDto = z.infer<typeof salaryRegisterSchema>;

export const salaryRegisterQuerySchema = z.object({
  asOf: isoDate.optional(),
  departmentId: z.string().uuid().optional(),
  /** Default: everyone not terminated. */
  includeTerminated: z.enum(['true', 'false']).optional(),
});
export type SalaryRegisterQueryDto = z.infer<typeof salaryRegisterQuerySchema>;

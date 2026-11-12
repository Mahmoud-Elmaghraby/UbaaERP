import { z } from 'zod';
import { payMonthSchema } from './loan.contract';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const minorUnits = z.string().regex(/^\d+$/);
const signedMinorUnits = z.string().regex(/^-?\d+$/);

/** draft (calculated, editable) → posted (approved, in the books, loans and adjustments settled) → paid. */
export const payrollRunStatusSchema = z.enum(['draft', 'posted', 'paid']);
export type PayrollRunStatusDto = z.infer<typeof payrollRunStatusSchema>;

/** The amounts HR may change on a line before posting (the rest comes from the employee's records). */
export const payrollOverrideFieldSchema = z.enum(['absence', 'late', 'overtime']);
export type PayrollOverrideFieldDto = z.infer<typeof payrollOverrideFieldSchema>;

/** One employee in a payroll run. Amounts in minor units of the run's currency. */
export const payrollLineSchema = z.object({
  id: z.string().uuid(),
  employeeId: z.string().uuid(),
  employeeCode: z.string(),
  employeeName: z.string(),
  departmentName: z.string().nullable(),
  paymentMethod: z.enum(['cash', 'bank', 'wallet']),
  bankName: z.string().nullable(),
  bankAccount: z.string().nullable(),
  basicMinorUnits: minorUnits,
  /** Recurring earning components. */
  allowancesMinorUnits: minorUnits,
  overtimeMinorUnits: minorUnits,
  bonusesMinorUnits: minorUnits,
  /** Basic + allowances + overtime + bonuses. */
  grossMinorUnits: minorUnits,
  /** Recurring deduction components. */
  componentDeductionsMinorUnits: minorUnits,
  absenceMinorUnits: minorUnits,
  lateMinorUnits: minorUnits,
  unpaidLeaveMinorUnits: minorUnits,
  penaltiesMinorUnits: minorUnits,
  loanMinorUnits: minorUnits,
  /** Signed hand adjustment (+ pays more). */
  manualAdjustmentMinorUnits: signedMinorUnits,
  manualAdjustmentNote: z.string().nullable(),
  netMinorUnits: minorUnits,
  overridden: z.array(payrollOverrideFieldSchema),
  /** How each amount was reached (days, minutes, rates, components…) — for the payslip and review. */
  details: z.record(z.unknown()),
  /** Warnings worth a look before posting (no salary, deductions capped…). */
  warnings: z.array(z.string()),
  paid: z.boolean(),
  paidOn: isoDate.nullable(),
});
export type PayrollLineDto = z.infer<typeof payrollLineSchema>;

export const payrollRunSummarySchema = z.object({
  id: z.string().uuid(),
  number: z.string(),
  month: payMonthSchema,
  branchName: z.string().nullable(),
  departmentName: z.string().nullable(),
  status: payrollRunStatusSchema,
  currency: z.string(),
  employeeCount: z.number().int(),
  grossMinorUnits: minorUnits,
  netMinorUnits: minorUnits,
  paidMinorUnits: minorUnits,
  createdAt: z.string(),
});
export type PayrollRunSummaryDto = z.infer<typeof payrollRunSummarySchema>;

export const payrollRunSchema = payrollRunSummarySchema.extend({
  branchId: z.string().uuid().nullable(),
  departmentId: z.string().uuid().nullable(),
  notes: z.string().nullable(),
  postedByName: z.string().nullable(),
  postedAt: z.string().nullable(),
  /** Totals by column. */
  totals: z.record(z.string()),
  lines: z.array(payrollLineSchema),
  payments: z.array(
    z.object({ id: z.string().uuid(), number: z.string(), date: isoDate, treasuryName: z.string(), amountMinorUnits: minorUnits, lineCount: z.number().int() }),
  ),
  /** Employees left out because another run of the month already has them. */
  skippedEmployees: z.array(z.string()),
});
export type PayrollRunDto = z.infer<typeof payrollRunSchema>;

export const createPayrollRunSchema = z.object({
  month: payMonthSchema,
  branchId: z.string().uuid().nullable().optional(),
  departmentId: z.string().uuid().nullable().optional(),
  notes: z.string().trim().max(500).nullable().optional(),
});
export type CreatePayrollRunDto = z.infer<typeof createPayrollRunSchema>;

/** Change a draft line: replace a suggested amount (null = back to the suggestion) and/or the hand adjustment. */
export const updatePayrollLineSchema = z.object({
  absenceMinorUnits: minorUnits.nullable().optional(),
  lateMinorUnits: minorUnits.nullable().optional(),
  overtimeMinorUnits: minorUnits.nullable().optional(),
  manualAdjustmentMinorUnits: signedMinorUnits.optional(),
  manualAdjustmentNote: z.string().trim().max(300).nullable().optional(),
});
export type UpdatePayrollLineDto = z.infer<typeof updatePayrollLineSchema>;

/** Pay the run's unpaid lines (or some of them) from one treasury. */
export const payPayrollSchema = z.object({
  treasuryId: z.string().uuid(),
  date: isoDate,
  lineIds: z.array(z.string().uuid()).max(5000).optional(),
});
export type PayPayrollDto = z.infer<typeof payPayrollSchema>;

export const payrollRunQuerySchema = z.object({ year: z.coerce.number().int().min(2000).max(2100).optional(), status: payrollRunStatusSchema.optional() });
export type PayrollRunQueryDto = z.infer<typeof payrollRunQuerySchema>;

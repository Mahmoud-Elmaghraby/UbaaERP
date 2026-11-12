import { z } from 'zod';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
/** A pay month, 'YYYY-MM'. */
export const payMonthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
const minorUnits = z.string().regex(/^\d+$/);

// ── loans and advances (السلف) ─────────────────────────────────────────────

/** pending → approved → active (paid out) → closed (repaid); pending/approved → rejected / cancelled. */
export const loanStatusSchema = z.enum(['pending', 'approved', 'active', 'closed', 'rejected', 'cancelled']);
export type LoanStatusDto = z.infer<typeof loanStatusSchema>;

export const loanInstallmentSchema = z.object({
  id: z.string().uuid(),
  sequence: z.number().int(),
  /** The pay month it is deducted in. */
  month: payMonthSchema,
  amountMinorUnits: minorUnits,
  paidMinorUnits: minorUnits,
  status: z.enum(['due', 'partly_paid', 'paid']),
});
export type LoanInstallmentDto = z.infer<typeof loanInstallmentSchema>;

export const loanRepaymentSchema = z.object({
  id: z.string().uuid(),
  number: z.string(),
  date: isoDate,
  treasuryName: z.string(),
  amountMinorUnits: minorUnits,
});
export type LoanRepaymentDto = z.infer<typeof loanRepaymentSchema>;

export const loanSummarySchema = z.object({
  id: z.string().uuid(),
  number: z.string(),
  employeeId: z.string().uuid(),
  employeeCode: z.string(),
  employeeName: z.string(),
  amountMinorUnits: minorUnits,
  currency: z.string(),
  installmentCount: z.number().int(),
  firstMonth: payMonthSchema,
  /** Amount − every payment so far. */
  remainingMinorUnits: minorUnits,
  status: loanStatusSchema,
  disbursedOn: isoDate.nullable(),
  createdAt: z.string(),
});
export type LoanSummaryDto = z.infer<typeof loanSummarySchema>;

export const loanSchema = loanSummarySchema.extend({
  reason: z.string().nullable(),
  treasuryId: z.string().uuid().nullable(),
  treasuryName: z.string().nullable(),
  decidedByName: z.string().nullable(),
  decisionNote: z.string().nullable(),
  installments: z.array(loanInstallmentSchema),
  repayments: z.array(loanRepaymentSchema),
});
export type LoanDto = z.infer<typeof loanSchema>;

export const createLoanSchema = z
  .object({
    employeeId: z.string().uuid(),
    amountMinorUnits: minorUnits.refine((v) => BigInt(v) > 0n, 'must be positive'),
    /** Either how many installments… */
    installmentCount: z.number().int().min(1).max(120).optional(),
    /** …or how much each one is (the last one takes the rest). */
    installmentMinorUnits: minorUnits.optional(),
    firstMonth: payMonthSchema,
    reason: z.string().trim().max(500).nullable().optional(),
  })
  .refine((v) => (v.installmentCount === undefined) !== (v.installmentMinorUnits === undefined), {
    message: 'Give the number of installments or the installment amount',
    path: ['installmentCount'],
  });
export type CreateLoanDto = z.infer<typeof createLoanSchema>;

export const loanDecisionSchema = z.object({ note: z.string().trim().max(300).nullable().optional() });
export type LoanDecisionDto = z.infer<typeof loanDecisionSchema>;

export const disburseLoanSchema = z.object({ treasuryId: z.string().uuid(), date: isoDate });
export type DisburseLoanDto = z.infer<typeof disburseLoanSchema>;

/** Cash paid back by the employee: covers the oldest open installments first. */
export const repayLoanSchema = z.object({
  treasuryId: z.string().uuid(),
  date: isoDate,
  amountMinorUnits: minorUnits.refine((v) => BigInt(v) > 0n, 'must be positive'),
});
export type RepayLoanDto = z.infer<typeof repayLoanSchema>;

/** Moves every open installment from `month` on by one month. */
export const postponeLoanSchema = z.object({ month: payMonthSchema });
export type PostponeLoanDto = z.infer<typeof postponeLoanSchema>;

export const loanQuerySchema = z.object({
  status: loanStatusSchema.optional(),
  employeeId: z.string().uuid().optional(),
  /** Only loans still being repaid. */
  open: z.enum(['true', 'false']).optional(),
});
export type LoanQueryDto = z.infer<typeof loanQuerySchema>;

// ── bonuses and penalties (المكافآت والجزاءات) ─────────────────────────────

export const payAdjustmentKindSchema = z.enum(['bonus', 'penalty']);
export type PayAdjustmentKindDto = z.infer<typeof payAdjustmentKindSchema>;

export const payAdjustmentSchema = z.object({
  id: z.string().uuid(),
  employeeId: z.string().uuid(),
  employeeCode: z.string(),
  employeeName: z.string(),
  kind: payAdjustmentKindSchema,
  month: payMonthSchema,
  /** A fixed amount… */
  amountMinorUnits: minorUnits.nullable(),
  /** …or days of pay (valued at the day rate when payroll runs). */
  days: z.number().nullable(),
  reason: z.string(),
  /** Taken into a payroll run (then it can no longer be deleted). */
  settled: z.boolean(),
  createdAt: z.string(),
  createdByName: z.string().nullable(),
});
export type PayAdjustmentDto = z.infer<typeof payAdjustmentSchema>;

export const createPayAdjustmentsSchema = z
  .object({
    /** One or many employees get the same line (a holiday bonus for a whole department). */
    employeeIds: z.array(z.string().uuid()).min(1).max(5000),
    kind: payAdjustmentKindSchema,
    month: payMonthSchema,
    amountMinorUnits: minorUnits.nullable().optional(),
    days: z.number().min(0.25).max(60).multipleOf(0.25).nullable().optional(),
    reason: z.string().trim().min(1).max(300),
  })
  .refine((v) => (v.amountMinorUnits == null) !== (v.days == null), { message: 'Give an amount or days', path: ['amountMinorUnits'] });
export type CreatePayAdjustmentsDto = z.infer<typeof createPayAdjustmentsSchema>;

export const payAdjustmentQuerySchema = z.object({
  month: payMonthSchema.optional(),
  employeeId: z.string().uuid().optional(),
  kind: payAdjustmentKindSchema.optional(),
});
export type PayAdjustmentQueryDto = z.infer<typeof payAdjustmentQuerySchema>;

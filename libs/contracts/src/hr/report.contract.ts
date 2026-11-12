import { z } from 'zod';

const minorUnits = z.string().regex(/^\d+$/);

/** HR at a glance for a year: headcount, hires and leavers, payroll cost, IDs to renew. */
export const hrOverviewSchema = z.object({
  year: z.number().int(),
  currency: z.string(),
  headcount: z.object({
    active: z.number().int(),
    suspended: z.number().int(),
    byDepartment: z.array(z.object({ departmentName: z.string().nullable(), count: z.number().int() })),
    byEmploymentType: z.array(z.object({ employmentType: z.string(), count: z.number().int() })),
  }),
  /** Twelve months. */
  movement: z.array(z.object({ month: z.string(), hires: z.number().int(), leavers: z.number().int() })),
  /** Posted payroll runs by month — null without a payroll permission. */
  payrollCost: z
    .array(
      z.object({
        month: z.string(),
        employees: z.number().int(),
        grossMinorUnits: minorUnits,
        netMinorUnits: minorUnits,
        loanMinorUnits: minorUnits,
        /** Salary cost booked (net + loan installments). */
        expenseMinorUnits: minorUnits,
      }),
    )
    .nullable(),
  /** The year's posted salary cost by department — null without a payroll permission. */
  costByDepartment: z.array(z.object({ departmentName: z.string().nullable(), expenseMinorUnits: minorUnits })).nullable(),
  /** National IDs expired or expiring within 60 days (active employees). */
  expiringIds: z.array(z.object({ employeeId: z.string().uuid(), code: z.string(), fullName: z.string(), expiry: z.string() })),
  /** Open loans: how many and what is still owed — null without a loans permission. */
  openLoans: z.object({ count: z.number().int(), remainingMinorUnits: minorUnits }).nullable(),
});
export type HrOverviewDto = z.infer<typeof hrOverviewSchema>;

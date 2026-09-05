import { z } from 'zod';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected an ISO date (YYYY-MM-DD)');

export const accountingPeriodStatusSchema = z.enum(['open', 'closed']);
export type AccountingPeriodStatus = z.infer<typeof accountingPeriodStatusSchema>;

// No create/update schema — accounting_periods have no standalone create
// endpoint (generated only by FiscalYearsService.create()) and no
// editable fields beyond status, which goes through the dedicated
// close()/reopen() actions on AccountingPeriodsController.
export const accountingPeriodSchema = z.object({
  id: z.string().uuid(),
  fiscalYearId: z.string().uuid(),
  name: z.string().min(1),
  startDate: isoDate,
  endDate: isoDate,
  status: accountingPeriodStatusSchema,
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type AccountingPeriodDto = z.infer<typeof accountingPeriodSchema>;

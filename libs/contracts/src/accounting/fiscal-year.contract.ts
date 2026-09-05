import { z } from 'zod';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected an ISO date (YYYY-MM-DD)');

export const fiscalYearStatusSchema = z.enum(['open', 'closed']);
export type FiscalYearStatus = z.infer<typeof fiscalYearStatusSchema>;

export const fiscalYearSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  startDate: isoDate,
  endDate: isoDate,
  status: fiscalYearStatusSchema,
  notes: z.string().nullable(),
  customFields: z.record(z.unknown()),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type FiscalYearDto = z.infer<typeof fiscalYearSchema>;

export const createFiscalYearSchema = z.object({
  name: z.string().min(1),
  startDate: isoDate,
  endDate: isoDate,
  notes: z.string().nullable().optional(),
  customFields: z.record(z.unknown()).optional(),
});
export type CreateFiscalYearDto = z.infer<typeof createFiscalYearSchema>;

// Dates are immutable after creation — accounting_periods are generated
// from them at create time (FiscalYearsService.create()); changing them
// later would leave the generated periods inconsistent with the year's
// own range. status is not settable here — see the dedicated close()/
// reopen() actions on FiscalYearsController.
export const updateFiscalYearSchema = z.object({
  name: z.string().min(1).optional(),
  notes: z.string().nullable().optional(),
  customFields: z.record(z.unknown()).optional(),
});
export type UpdateFiscalYearDto = z.infer<typeof updateFiscalYearSchema>;

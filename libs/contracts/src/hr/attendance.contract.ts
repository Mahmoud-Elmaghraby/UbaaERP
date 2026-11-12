import { z } from 'zod';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
/** Minutes after midnight, 0–1439. */
const minuteOfDay = z.number().int().min(0).max(1439);
/** Weekday, 0 = Sunday … 6 = Saturday. */
const weekday = z.number().int().min(0).max(6);

/** A work shift (وردية). An end at or before the start runs past midnight. */
export const hrShiftSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  startMinute: minuteOfDay,
  endMinute: minuteOfDay,
  graceMinutes: z.number().int(),
  breakMinutes: z.number().int(),
  weeklyOffDays: z.array(weekday),
  /** Employees without a shift of their own follow the default one. */
  isDefault: z.boolean(),
  isActive: z.boolean(),
  /** Scheduled work minutes per day (length − break). */
  scheduledMinutes: z.number().int(),
  employeeCount: z.number().int(),
});
export type HrShiftDto = z.infer<typeof hrShiftSchema>;

export const saveHrShiftSchema = z.object({
  name: z.string().trim().min(1).max(60),
  startMinute: minuteOfDay,
  endMinute: minuteOfDay,
  graceMinutes: z.number().int().min(0).max(240).default(15),
  breakMinutes: z.number().int().min(0).max(480).default(0),
  weeklyOffDays: z.array(weekday).max(6).default([5]),
  isDefault: z.boolean().optional(),
  isActive: z.boolean().optional(),
});
export type SaveHrShiftDto = z.infer<typeof saveHrShiftSchema>;

/** A public holiday (إجازة رسمية). */
export const hrHolidaySchema = z.object({ id: z.string().uuid(), date: isoDate, name: z.string() });
export type HrHolidayDto = z.infer<typeof hrHolidaySchema>;

export const saveHrHolidaysSchema = z.object({
  /** One or more days (a multi-day holiday is several dates with the same name). */
  dates: z.array(isoDate).min(1).max(31),
  name: z.string().trim().min(1).max(80),
});
export type SaveHrHolidaysDto = z.infer<typeof saveHrHolidaysSchema>;

export const attendanceStatusSchema = z.enum(['present', 'absent', 'weekend', 'holiday', 'leave']);
export type AttendanceStatusDto = z.infer<typeof attendanceStatusSchema>;

/** One employee-day of the attendance sheet. Times are minutes after the work day's midnight (≥ 1440 = next day). */
export const attendanceDaySchema = z.object({
  id: z.string().uuid(),
  employeeId: z.string().uuid(),
  employeeCode: z.string(),
  employeeName: z.string(),
  workDate: isoDate,
  status: attendanceStatusSchema,
  checkInMinute: z.number().int().nullable(),
  checkOutMinute: z.number().int().nullable(),
  /** One punch only — the check-out (or check-in) is missing. */
  missingPunch: z.boolean(),
  workedMinutes: z.number().int(),
  lateMinutes: z.number().int(),
  earlyLeaveMinutes: z.number().int(),
  overtimeMinutes: z.number().int(),
  /** Edited by hand — rebuilding from punches leaves it alone. */
  isManual: z.boolean(),
  note: z.string().nullable(),
});
export type AttendanceDayDto = z.infer<typeof attendanceDaySchema>;

export const attendanceQuerySchema = z.object({
  from: isoDate,
  to: isoDate,
  employeeId: z.string().uuid().optional(),
  departmentId: z.string().uuid().optional(),
  status: attendanceStatusSchema.optional(),
  /** Only days with something to look at: absent, late, early leave, missing punch. */
  exceptionsOnly: z.enum(['true', 'false']).optional(),
});
export type AttendanceQueryDto = z.infer<typeof attendanceQuerySchema>;

/** Correct one day by hand. Times as minutes after the day's midnight (checkout may be ≥ 1440). */
export const updateAttendanceDaySchema = z.object({
  status: attendanceStatusSchema,
  checkInMinute: z.number().int().min(0).max(1439).nullable().optional(),
  checkOutMinute: z.number().int().min(0).max(2879).nullable().optional(),
  note: z.string().trim().max(300).nullable().optional(),
});
export type UpdateAttendanceDayDto = z.infer<typeof updateAttendanceDaySchema>;

export const rebuildAttendanceSchema = z.object({
  from: isoDate,
  to: isoDate,
  employeeIds: z.array(z.string().uuid()).max(5000).optional(),
});
export type RebuildAttendanceDto = z.infer<typeof rebuildAttendanceSchema>;

export const rebuildAttendanceResultSchema = z.object({ days: z.number().int(), keptManual: z.number().int() });
export type RebuildAttendanceResultDto = z.infer<typeof rebuildAttendanceResultSchema>;

/** Per-employee totals over a period — what payroll reads. */
export const attendanceSummaryRowSchema = z.object({
  employeeId: z.string().uuid(),
  employeeCode: z.string(),
  employeeName: z.string(),
  departmentName: z.string().nullable(),
  workDays: z.number().int(),
  presentDays: z.number().int(),
  absentDays: z.number().int(),
  leaveDays: z.number().int(),
  missingPunchDays: z.number().int(),
  lateMinutes: z.number().int(),
  earlyLeaveMinutes: z.number().int(),
  overtimeMinutes: z.number().int(),
  workedMinutes: z.number().int(),
});
export type AttendanceSummaryRowDto = z.infer<typeof attendanceSummaryRowSchema>;

export const dateFormatSchema = z.enum(['dmy', 'mdy', 'ymd']);
export type AttendanceDateFormatDto = z.infer<typeof dateFormatSchema>;

/**
 * A fingerprint-device export, already mapped to columns by the screen: who (device ID or employee
 * code) and when (one date-time cell, or a date cell plus a time cell). Values as the file has them;
 * the API parses dates (ISO, d/m/y or m/d/y, Excel serial numbers) and times (24h or AM/PM).
 */
export const attendanceImportSchema = z.object({
  fileName: z.string().trim().max(200),
  dateFormat: dateFormatSchema.default('dmy'),
  rows: z
    .array(z.object({ employeeKey: z.string().max(60), date: z.string().max(40), time: z.string().max(20).optional() }))
    .min(1)
    .max(100_000),
});
export type AttendanceImportDto = z.infer<typeof attendanceImportSchema>;

export const attendanceImportResultSchema = z.object({
  rowsTotal: z.number().int(),
  imported: z.number().int(),
  duplicates: z.number().int(),
  /** Employee keys that match nobody (device ID or code). */
  unmatchedKeys: z.array(z.string()),
  unmatchedRows: z.number().int(),
  /** Row numbers (1-based) whose date or time could not be read; first 50. */
  invalidRows: z.array(z.number().int()),
  from: isoDate.nullable(),
  to: isoDate.nullable(),
  /** Days (re)built from the new punches. */
  days: z.number().int(),
});
export type AttendanceImportResultDto = z.infer<typeof attendanceImportResultSchema>;

import { z } from 'zod';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
/** Leave days: whole or half days. */
const leaveDays = z.number().min(0).max(366).multipleOf(0.5);

/** A leave type (نوع إجازة). */
export const leaveTypeSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  /** % of the day's pay kept on this leave: 100 paid, 0 unpaid. */
  payPercent: z.number().int(),
  /** Taken out of a yearly balance (false = no limit, e.g. unpaid or sick leave). */
  hasBalance: z.boolean(),
  /** The yearly entitlement when the balance isn't set per employee. */
  annualDays: z.number().nullable(),
  /** The most unused days that roll into next year (0 = none). */
  maxCarryOver: z.number(),
  /** Also uses this type's balance (casual leave comes out of the annual balance). */
  parentTypeId: z.string().uuid().nullable(),
  parentTypeName: z.string().nullable(),
  isActive: z.boolean(),
});
export type LeaveTypeDto = z.infer<typeof leaveTypeSchema>;

export const saveLeaveTypeSchema = z.object({
  name: z.string().trim().min(1).max(60),
  payPercent: z.number().int().min(0).max(100),
  hasBalance: z.boolean(),
  annualDays: leaveDays.nullable().optional(),
  maxCarryOver: leaveDays.default(0),
  parentTypeId: z.string().uuid().nullable().optional(),
  isActive: z.boolean().optional(),
});
export type SaveLeaveTypeDto = z.infer<typeof saveLeaveTypeSchema>;

export const leaveRequestStatusSchema = z.enum(['pending', 'approved', 'rejected', 'cancelled']);
export type LeaveRequestStatusDto = z.infer<typeof leaveRequestStatusSchema>;

export const leaveRequestSchema = z.object({
  id: z.string().uuid(),
  number: z.string(),
  employeeId: z.string().uuid(),
  employeeCode: z.string(),
  employeeName: z.string(),
  /** The employee's direct manager — who should approve. */
  managerName: z.string().nullable(),
  leaveTypeId: z.string().uuid(),
  leaveTypeName: z.string(),
  startDate: isoDate,
  endDate: isoDate,
  halfDay: z.boolean(),
  /** Working days the leave takes (weekly days off and public holidays excluded). */
  days: z.number(),
  reason: z.string().nullable(),
  status: leaveRequestStatusSchema,
  decidedByName: z.string().nullable(),
  decidedAt: z.string().nullable(),
  decisionNote: z.string().nullable(),
  createdAt: z.string(),
});
export type LeaveRequestDto = z.infer<typeof leaveRequestSchema>;

export const createLeaveRequestSchema = z
  .object({
    employeeId: z.string().uuid(),
    leaveTypeId: z.string().uuid(),
    startDate: isoDate,
    endDate: isoDate,
    /** Only for a one-day leave. */
    halfDay: z.boolean().default(false),
    reason: z.string().trim().max(500).nullable().optional(),
  })
  .refine((v) => v.endDate >= v.startDate, { message: 'endDate before startDate', path: ['endDate'] })
  .refine((v) => !v.halfDay || v.startDate === v.endDate, { message: 'A half day is a single day', path: ['halfDay'] });
export type CreateLeaveRequestDto = z.infer<typeof createLeaveRequestSchema>;

export const decideLeaveRequestSchema = z.object({ note: z.string().trim().max(300).nullable().optional() });
export type DecideLeaveRequestDto = z.infer<typeof decideLeaveRequestSchema>;

export const leaveRequestQuerySchema = z.object({
  status: leaveRequestStatusSchema.optional(),
  employeeId: z.string().uuid().optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
});
export type LeaveRequestQueryDto = z.infer<typeof leaveRequestQuerySchema>;

/** What a request would take, before saving it. */
export const leavePreviewSchema = z.object({
  days: z.number(),
  /** null when the type has no balance. */
  available: z.number().nullable(),
  /** Days already pending on other requests, included in `available`. */
  pending: z.number(),
});
export type LeavePreviewDto = z.infer<typeof leavePreviewSchema>;

/** One employee's balance of one leave type for a year. */
export const leaveBalanceSchema = z.object({
  employeeId: z.string().uuid(),
  employeeCode: z.string(),
  employeeName: z.string(),
  leaveTypeId: z.string().uuid(),
  leaveTypeName: z.string(),
  year: z.number().int(),
  entitled: z.number(),
  carriedOver: z.number(),
  /** Opening balance or a correction (can be negative). */
  adjustment: z.number(),
  /** Approved days, including child types (casual within annual). */
  used: z.number(),
  pending: z.number(),
  /** entitled + carried + adjustment − used − pending. */
  available: z.number(),
  /** True when the entitlement was set for this employee (not the type's default). */
  isCustom: z.boolean(),
  note: z.string().nullable(),
});
export type LeaveBalanceDto = z.infer<typeof leaveBalanceSchema>;

export const leaveBalanceQuerySchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
  employeeId: z.string().uuid().optional(),
  leaveTypeId: z.string().uuid().optional(),
});
export type LeaveBalanceQueryDto = z.infer<typeof leaveBalanceQuerySchema>;

export const saveLeaveBalanceSchema = z.object({
  employeeId: z.string().uuid(),
  leaveTypeId: z.string().uuid(),
  year: z.number().int().min(2000).max(2100),
  entitled: leaveDays,
  carriedOver: leaveDays.default(0),
  adjustment: z.number().min(-366).max(366).multipleOf(0.5).default(0),
  note: z.string().trim().max(300).nullable().optional(),
});
export type SaveLeaveBalanceDto = z.infer<typeof saveLeaveBalanceSchema>;

export const carryOverLeaveSchema = z.object({ fromYear: z.number().int().min(2000).max(2099) });
export type CarryOverLeaveDto = z.infer<typeof carryOverLeaveSchema>;

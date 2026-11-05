import { z } from 'zod';

/** Installment schedules (التقسيط) on a sales invoice. Amounts are minor-unit integer strings. */

const minorUnits = z.string().regex(/^\d+$/, 'Amount must be a whole number of minor units.');
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD.');

export const installmentStatusSchema = z.enum(['paid', 'partially_paid', 'due', 'overdue']);
export type InstallmentStatusDto = z.infer<typeof installmentStatusSchema>;

export const salesInvoiceInstallmentSchema = z.object({
  id: z.string().uuid(),
  sequence: z.number().int().positive(),
  dueDate: z.string(),
  amountMinorUnits: z.string(),
  notes: z.string().nullable(),
  /** Collected against this installment (the invoice's collections applied oldest first). */
  paidMinorUnits: z.string(),
  remainingMinorUnits: z.string(),
  status: installmentStatusSchema,
  overdueDays: z.number().int(),
});
export type SalesInvoiceInstallmentDto = z.infer<typeof salesInvoiceInstallmentSchema>;

export const salesInvoiceInstallmentScheduleSchema = z.object({
  salesInvoiceId: z.string().uuid(),
  currency: z.string(),
  totalMinorUnits: z.string(),
  /** Paid by posted receipts + credited by credit notes. */
  collectedMinorUnits: z.string(),
  /** The schedule can be replaced: invoice draft/posted and nothing collected yet. */
  editable: z.boolean(),
  installments: z.array(salesInvoiceInstallmentSchema),
});
export type SalesInvoiceInstallmentScheduleDto = z.infer<typeof salesInvoiceInstallmentScheduleSchema>;

/** PUT /sales-invoices/:id/installments — replaces the schedule; [] removes it. */
export const replaceSalesInvoiceInstallmentsSchema = z.object({
  installments: z
    .array(
      z.object({
        dueDate: isoDate,
        amountMinorUnits: minorUnits,
        notes: z.string().trim().max(200).nullable().optional(),
      }),
    )
    .max(120),
});
export type ReplaceSalesInvoiceInstallmentsDto = z.infer<typeof replaceSalesInvoiceInstallmentsSchema>;

/** POST /sales-invoices/:id/installments/generate — a preview; nothing is saved. */
export const generateSalesInvoiceInstallmentsSchema = z.object({
  count: z.number().int().min(1).max(120),
  firstDueDate: isoDate,
  intervalMonths: z.number().int().min(1).max(12).optional(),
  downPaymentMinorUnits: minorUnits.optional(),
  downPaymentDate: isoDate.optional(),
});
export type GenerateSalesInvoiceInstallmentsDto = z.infer<typeof generateSalesInvoiceInstallmentsSchema>;

export const plannedInstallmentSchema = z.object({
  sequence: z.number().int().positive(),
  dueDate: z.string(),
  amountMinorUnits: z.string(),
  notes: z.string().nullable(),
});
export type PlannedInstallmentDto = z.infer<typeof plannedInstallmentSchema>;

/** GET /sales-installments — open installments across customers (the "installments due" report). */
export const installmentDueRowSchema = z.object({
  id: z.string().uuid(),
  salesInvoiceId: z.string().uuid(),
  invoiceNumber: z.string(),
  customerId: z.string().uuid(),
  customerName: z.string(),
  sequence: z.number().int().positive(),
  installmentsCount: z.number().int().positive(),
  dueDate: z.string(),
  currency: z.string(),
  amountMinorUnits: z.string(),
  paidMinorUnits: z.string(),
  remainingMinorUnits: z.string(),
  status: installmentStatusSchema,
  overdueDays: z.number().int(),
});
export type InstallmentDueRowDto = z.infer<typeof installmentDueRowSchema>;

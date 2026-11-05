import { z } from 'zod';
import { moneySchema, positiveMoneySchema } from '../inventory/money.contract';

export const paymentReceivedStatusSchema = z.enum(['draft', 'posted', 'cancelled', 'bounced']);
export type PaymentReceivedStatusDto = z.infer<typeof paymentReceivedStatusSchema>;

export const paymentMethodSchema = z.enum(['cash', 'bank_transfer', 'check', 'card', 'other']);
export type PaymentMethodDto = z.infer<typeof paymentMethodSchema>;

export const paymentAllocationSchema = z.object({
  id: z.string().uuid(),
  paymentReceivedId: z.string().uuid(),
  salesInvoiceId: z.string().uuid(),
  allocatedAmount: moneySchema,
  createdAt: z.coerce.date(),
});
export type PaymentAllocationDto = z.infer<typeof paymentAllocationSchema>;

export const paymentReceivedSchema = z.object({
  id: z.string().uuid(),
  paymentNumber: z.string().min(1),
  customerId: z.string().uuid(),
  status: paymentReceivedStatusSchema,
  paymentDate: z.string().nullable(),
  paymentMethod: paymentMethodSchema,
  referenceNumber: z.string().nullable(),
  amount: moneySchema,
  notes: z.string().nullable(),
  customFields: z.record(z.unknown()),
  /** Migration 0060 — set when this payment was recorded within a POS cash session (Stage 3 checkout); read-only, never accepted on create. */
  posSessionId: z.string().uuid().nullable(),
  /** Bank account a non-cash receipt was deposited to (null = cash, or the default bank account). */
  treasuryId: z.string().uuid().nullable(),
  /** Cheque receipts (payment method 'check'); null otherwise. */
  cheque: z
    .object({
      number: z.string().nullable(),
      bank: z.string().nullable(),
      dueDate: z.string().nullable(),
      status: z.enum(['in_hand', 'collected', 'bounced', 'endorsed']).nullable(),
      statusDate: z.string().nullable(),
      endorsedToPaymentId: z.string().uuid().nullable(),
    })
    .nullable()
    .default(null),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type PaymentReceivedDto = z.infer<typeof paymentReceivedSchema>;

export const paymentReceivedWithAllocationsSchema = paymentReceivedSchema.extend({
  allocations: z.array(paymentAllocationSchema),
  unallocatedAmount: moneySchema,
});
export type PaymentReceivedWithAllocationsDto = z.infer<typeof paymentReceivedWithAllocationsSchema>;

export const createPaymentAllocationSchema = z.object({
  salesInvoiceId: z.string().uuid(),
  allocatedAmount: positiveMoneySchema,
});
export type CreatePaymentAllocationDto = z.infer<typeof createPaymentAllocationSchema>;

export const createPaymentReceivedSchema = z.object({
  customerId: z.string().uuid(),
  amount: positiveMoneySchema,
  paymentMethod: paymentMethodSchema,
  paymentDate: z.string().nullable().optional(),
  referenceNumber: z.string().nullable().optional(),
  allocations: z.array(createPaymentAllocationSchema).optional(),
  treasuryId: z.string().uuid().nullable().optional(),
  /** Required when paymentMethod is 'check'. */
  cheque: z
    .object({ number: z.string().trim().min(1).max(60), bank: z.string().trim().max(120).nullable().optional(), dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) })
    .nullable()
    .optional(),
  notes: z.string().nullable().optional(),
  customFields: z.record(z.unknown()).optional(),
});
export type CreatePaymentReceivedDto = z.infer<typeof createPaymentReceivedSchema>;

export const allocatePaymentReceivedSchema = z.object({
  allocations: z.array(createPaymentAllocationSchema).min(1),
});
export type AllocatePaymentReceivedDto = z.infer<typeof allocatePaymentReceivedSchema>;

/**
 * A row of the receipts register: a payment with its customer name and how
 * much of it is allocated to invoices / still unallocated. With
 * ?salesInvoiceId= only the payments allocated to that invoice are listed and
 * `allocatedToInvoiceMinorUnits` is what each applied to it.
 */
export const paymentReceivedRegisterRowSchema = z.object({
  id: z.string().uuid(),
  paymentNumber: z.string(),
  status: paymentReceivedStatusSchema,
  paymentDate: z.string().nullable(),
  paymentMethod: paymentMethodSchema,
  referenceNumber: z.string().nullable(),
  customerId: z.string().uuid(),
  customerName: z.string(),
  currency: z.string(),
  amountMinorUnits: z.string(),
  allocatedMinorUnits: z.string(),
  unallocatedMinorUnits: z.string(),
  allocatedToInvoiceMinorUnits: z.string().nullable(),
  createdAt: z.coerce.date(),
});
export type PaymentReceivedRegisterRowDto = z.infer<typeof paymentReceivedRegisterRowSchema>;

/** A received cheque (أوراق قبض) for the cheques screen. */
export const receivedChequeSchema = z.object({
  id: z.string().uuid(),
  paymentNumber: z.string(),
  paymentDate: z.string().nullable(),
  customerId: z.string().uuid(),
  customerName: z.string(),
  chequeNumber: z.string().nullable(),
  bank: z.string().nullable(),
  dueDate: z.string().nullable(),
  status: z.enum(['in_hand', 'collected', 'bounced', 'endorsed']),
  statusDate: z.string().nullable(),
  amount: moneySchema,
  /** The bank it was collected into. */
  treasuryName: z.string().nullable(),
  endorsedToPaymentId: z.string().uuid().nullable(),
  endorsedToSupplierName: z.string().nullable(),
});
export type ReceivedChequeDto = z.infer<typeof receivedChequeSchema>;

export const collectChequeSchema = z.object({
  treasuryId: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
});
export type CollectChequeDto = z.infer<typeof collectChequeSchema>;

export const chequeDateSchema = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional() });
export type ChequeDateDto = z.infer<typeof chequeDateSchema>;

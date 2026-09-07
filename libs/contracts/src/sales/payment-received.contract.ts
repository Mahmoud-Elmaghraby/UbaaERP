import { z } from 'zod';
import { moneySchema } from '../inventory/money.contract';

export const paymentReceivedStatusSchema = z.enum(['draft', 'posted', 'cancelled']);
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
  allocatedAmount: moneySchema,
});
export type CreatePaymentAllocationDto = z.infer<typeof createPaymentAllocationSchema>;

export const createPaymentReceivedSchema = z.object({
  customerId: z.string().uuid(),
  amount: moneySchema,
  paymentMethod: paymentMethodSchema,
  paymentDate: z.string().nullable().optional(),
  referenceNumber: z.string().nullable().optional(),
  allocations: z.array(createPaymentAllocationSchema).optional(),
  notes: z.string().nullable().optional(),
  customFields: z.record(z.unknown()).optional(),
});
export type CreatePaymentReceivedDto = z.infer<typeof createPaymentReceivedSchema>;

export const allocatePaymentReceivedSchema = z.object({
  allocations: z.array(createPaymentAllocationSchema).min(1),
});
export type AllocatePaymentReceivedDto = z.infer<typeof allocatePaymentReceivedSchema>;

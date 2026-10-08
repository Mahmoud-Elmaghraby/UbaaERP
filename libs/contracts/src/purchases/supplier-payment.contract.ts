import { z } from 'zod';
import { moneySchema } from '../inventory/money.contract';
import { paymentMethodSchema } from '../sales/payment-received.contract';

/** Supplier Payments — the Purchases mirror of Sales' Payments Received (migration 0090). */
export const supplierPaymentStatusSchema = z.enum(['draft', 'posted', 'cancelled']);
export type SupplierPaymentStatusDto = z.infer<typeof supplierPaymentStatusSchema>;

export const supplierPaymentAllocationSchema = z.object({
  id: z.string().uuid(),
  supplierPaymentId: z.string().uuid(),
  purchaseInvoiceId: z.string().uuid(),
  allocatedAmount: moneySchema,
  createdAt: z.coerce.date(),
});
export type SupplierPaymentAllocationDto = z.infer<typeof supplierPaymentAllocationSchema>;

export const supplierPaymentSchema = z.object({
  id: z.string().uuid(),
  paymentNumber: z.string().min(1),
  supplierId: z.string().uuid(),
  status: supplierPaymentStatusSchema,
  paymentDate: z.string().nullable(),
  paymentMethod: paymentMethodSchema,
  referenceNumber: z.string().nullable(),
  amount: moneySchema,
  /** Bank account the payment was made from (null = cash, or the default bank account). */
  treasuryId: z.string().uuid().nullable(),
  notes: z.string().nullable(),
  customFields: z.record(z.unknown()),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type SupplierPaymentDto = z.infer<typeof supplierPaymentSchema>;

export const supplierPaymentWithAllocationsSchema = supplierPaymentSchema.extend({
  allocations: z.array(supplierPaymentAllocationSchema),
  unallocatedAmount: moneySchema,
});
export type SupplierPaymentWithAllocationsDto = z.infer<typeof supplierPaymentWithAllocationsSchema>;

export const createSupplierPaymentAllocationSchema = z.object({
  purchaseInvoiceId: z.string().uuid(),
  allocatedAmount: moneySchema,
});
export type CreateSupplierPaymentAllocationDto = z.infer<typeof createSupplierPaymentAllocationSchema>;

export const createSupplierPaymentSchema = z.object({
  supplierId: z.string().uuid(),
  amount: moneySchema,
  paymentMethod: paymentMethodSchema,
  paymentDate: z.string().nullable().optional(),
  referenceNumber: z.string().nullable().optional(),
  allocations: z.array(createSupplierPaymentAllocationSchema).optional(),
  treasuryId: z.string().uuid().nullable().optional(),
  notes: z.string().nullable().optional(),
  customFields: z.record(z.unknown()).optional(),
});
export type CreateSupplierPaymentDto = z.infer<typeof createSupplierPaymentSchema>;

export const allocateSupplierPaymentSchema = z.object({
  allocations: z.array(createSupplierPaymentAllocationSchema).min(1),
});
export type AllocateSupplierPaymentDto = z.infer<typeof allocateSupplierPaymentSchema>;

/** One posted purchase invoice of a supplier with what is still owed on it (GET /supplier-payments/outstanding-invoices). */
export const supplierOutstandingInvoiceSchema = z.object({
  purchaseInvoiceId: z.string().uuid(),
  invoiceNumber: z.string().min(1),
  supplierInvoiceNumber: z.string().nullable(),
  invoiceDate: z.string().nullable(),
  dueDate: z.string().nullable(),
  totalAmount: moneySchema,
  paidAmount: moneySchema,
  outstandingAmount: moneySchema,
});
export type SupplierOutstandingInvoiceDto = z.infer<typeof supplierOutstandingInvoiceSchema>;

import { Money } from '@erp-platform/shared-kernel';

/**
 * Supplier Payment — the Purchases mirror of Sales' PaymentReceived, so
 * payables can be settled. A ledger-worthy financial document: posting
 * one goes through the Outbox (CLAUDE.md §2.7). See migration 0090.
 */
export type SupplierPaymentStatus = 'draft' | 'posted' | 'cancelled';

export type SupplierPaymentMethod = 'cash' | 'bank_transfer' | 'check' | 'card' | 'other';

export interface SupplierPaymentAllocation {
  id: string;
  supplierPaymentId: string;
  purchaseInvoiceId: string;
  allocatedAmount: Money;
  createdAt: Date;
}

export interface SupplierPayment {
  id: string;
  paymentNumber: string;
  supplierId: string;
  status: SupplierPaymentStatus;
  paymentDate: string | null;
  paymentMethod: SupplierPaymentMethod;
  referenceNumber: string | null;
  amount: Money;
  /** Bank account the payment was made from; null = cash / default bank. */
  treasuryId: string | null;
  notes: string | null;
  customFields: Record<string, unknown>;
  /** Migration 0112 — our own cheque (payment method 'check', not endorsed). */
  cheque: { number: string | null; bank: string | null; dueDate: string | null; status: 'issued' | 'cleared' | null; statusDate: string | null } | null;
  /** Migration 0112 — the customer cheque handed over as this payment (تظهير). */
  endorsedChequeId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface SupplierPaymentWithAllocations extends SupplierPayment {
  allocations: SupplierPaymentAllocation[];
  /** Derived, never stored: amount - sum(allocations). */
  unallocatedAmount: Money;
}

export interface CreateSupplierPaymentAllocationInput {
  purchaseInvoiceId: string;
  allocatedAmount: Money;
}

/** allocations is optional and may cover only part of `amount` (the rest stays as an advance to the supplier). */
export interface CreateSupplierPaymentInput {
  supplierId: string;
  amount: Money;
  paymentMethod: SupplierPaymentMethod;
  paymentDate?: string | null;
  referenceNumber?: string | null;
  allocations?: CreateSupplierPaymentAllocationInput[];
  treasuryId?: string | null;
  notes?: string | null;
  customFields?: Record<string, unknown>;
  /** Our own cheque: number, bank, due date (paymentMethod 'check'). */
  cheque?: { number: string; bank?: string | null; dueDate: string } | null;
  /** Pay with a customer cheque in hand instead (its amount and currency must match). */
  endorsedChequeId?: string | null;
}

/** A supplier's posted purchase invoice with what has been paid and what is still owed. */
export interface SupplierOutstandingInvoice {
  purchaseInvoiceId: string;
  invoiceNumber: string;
  supplierInvoiceNumber: string | null;
  invoiceDate: string | null;
  dueDate: string | null;
  totalAmount: Money;
  paidAmount: Money;
  outstandingAmount: Money;
}

export function calculateSupplierPaymentUnallocated(
  amount: Money,
  allocations: { allocatedAmount: Money }[],
): Money {
  return allocations.reduce((remaining, allocation) => remaining.subtract(allocation.allocatedAmount), amount);
}

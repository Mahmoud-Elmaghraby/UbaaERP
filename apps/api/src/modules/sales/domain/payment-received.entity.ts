import { Money } from '@erp-platform/shared-kernel';

/**
 * Payment Received (master doc §10, step 4 — Sales, Stage 6). The last
 * baseline entity in the master document's Sales entity list [مستقر].
 * A ledger-worthy financial document, like Sales Invoices — posting one
 * uses the Outbox Pattern (CLAUDE.md §2.7), not the plain Event Bus.
 * See migration 0046's comment for the full design rationale.
 */
export type PaymentReceivedStatus = 'draft' | 'posted' | 'cancelled' | 'bounced';

export type PaymentMethod = 'cash' | 'bank_transfer' | 'check' | 'card' | 'other';

export interface PaymentAllocation {
  id: string;
  paymentReceivedId: string;
  salesInvoiceId: string;
  allocatedAmount: Money;
  createdAt: Date;
}

export interface PaymentReceived {
  id: string;
  paymentNumber: string;
  customerId: string;
  status: PaymentReceivedStatus;
  paymentDate: string | null;
  paymentMethod: PaymentMethod;
  referenceNumber: string | null;
  amount: Money;
  notes: string | null;
  customFields: Record<string, unknown>;
  /** Migration 0060 — set when this payment was recorded within a POS cash session (Stage 3 checkout); null otherwise. */
  posSessionId: string | null;
  /** Migration 0089 — bank account a non-cash receipt was deposited to; null = cash / default bank. */
  treasuryId: string | null;
  /** Migration 0112 — a cheque receipt (payment method 'check'). */
  cheque: PaymentCheque | null;
  createdAt: Date;
  updatedAt: Date;
}

export type ReceivedChequeStatus = 'in_hand' | 'collected' | 'bounced' | 'endorsed';

export interface PaymentCheque {
  number: string | null;
  bank: string | null;
  dueDate: string | null;
  /** null while the receipt is a draft. */
  status: ReceivedChequeStatus | null;
  statusDate: string | null;
  /** The supplier payment it was endorsed to. */
  endorsedToPaymentId: string | null;
}

export interface PaymentReceivedWithAllocations extends PaymentReceived {
  allocations: PaymentAllocation[];
  /** Derived, never stored: amount - sum(allocations). A positive remainder is unapplied on-account credit. */
  unallocatedAmount: Money;
}

export interface CreatePaymentAllocationInput {
  salesInvoiceId: string;
  allocatedAmount: Money;
}

/**
 * allocations is optional and can be a strict subset of `amount` — a
 * payment can be recorded with zero allocations (pure on-account
 * credit) or partially allocated, with the remainder left unapplied.
 */
export interface CreatePaymentReceivedInput {
  customerId: string;
  amount: Money;
  paymentMethod: PaymentMethod;
  paymentDate?: string | null;
  referenceNumber?: string | null;
  allocations?: CreatePaymentAllocationInput[];
  notes?: string | null;
  customFields?: Record<string, unknown>;
  /** Set by PosSalesService.checkout() (Stage 3) to tag this payment as belonging to a POS cash session; omitted/undefined for every non-POS payment. */
  posSessionId?: string | null;
  treasuryId?: string | null;
  /** Cheque details when paymentMethod is 'check'. */
  cheque?: { number: string; bank?: string | null; dueDate: string } | null;
}

export function calculateUnallocatedAmount(
  amount: Money,
  allocations: { allocatedAmount: Money }[],
): Money {
  return allocations.reduce((remaining, allocation) => remaining.subtract(allocation.allocatedAmount), amount);
}

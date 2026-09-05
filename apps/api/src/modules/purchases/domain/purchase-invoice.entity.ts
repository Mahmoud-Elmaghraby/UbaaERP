import { Money } from '@erp-platform/shared-kernel';

/**
 * Purchase Invoice (master doc §10, step 3 — Purchases, Stage 7). This
 * codebase's first genuinely financial document — posting one (not
 * creating it — see PurchaseInvoicesService.post()) writes to the
 * Outbox Pattern (CLAUDE.md §2.7), not just the plain Event Bus every
 * earlier Purchases stage uses.
 */
export type PurchaseInvoiceStatus = 'draft' | 'posted' | 'cancelled';

export interface PurchaseInvoiceLine {
  id: string;
  purchaseInvoiceId: string;
  purchaseOrderLineId: string;
  productVariantId: string;
  quantityInvoiced: number;
  unitPrice: Money;
  notes: string | null;
  createdAt: Date;
}

export interface PurchaseInvoice {
  id: string;
  invoiceNumber: string;
  supplierInvoiceNumber: string | null;
  purchaseOrderId: string;
  status: PurchaseInvoiceStatus;
  invoiceDate: string | null;
  dueDate: string | null;
  notes: string | null;
  customFields: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface PurchaseInvoiceWithLines extends PurchaseInvoice {
  lines: PurchaseInvoiceLine[];
  /** Derived, never stored — see migration 0038's class comment. */
  totalAmount: Money;
}

/** productVariantId is always derived server-side from purchaseOrderLineId. unitPrice defaults to that PO line's price when omitted. */
export interface CreatePurchaseInvoiceLineInput {
  purchaseOrderLineId: string;
  quantityInvoiced: number;
  unitPrice?: Money;
  notes?: string | null;
}

export interface CreatePurchaseInvoiceInput {
  purchaseOrderId: string;
  supplierInvoiceNumber?: string | null;
  lines: CreatePurchaseInvoiceLineInput[];
  invoiceDate?: string | null;
  dueDate?: string | null;
  notes?: string | null;
  customFields?: Record<string, unknown>;
}

/** All lines on one purchase invoice must share a currency — same rule and rationale as purchase_orders. */
export function assertSingleCurrency(lines: { unitPrice: Money }[]): void {
  const currencies = new Set(lines.map((l) => l.unitPrice.currency));
  if (currencies.size > 1) {
    throw new Error(
      `A purchase invoice's lines must all use the same currency (found: ${[...currencies].join(', ')}).`,
    );
  }
}

export function calculatePurchaseInvoiceTotal(lines: { unitPrice: Money; quantityInvoiced: number }[]): Money {
  if (lines.length === 0) {
    throw new Error('Cannot compute a purchase invoice total with zero lines.');
  }
  return lines.reduce(
    (total, line) => total.add(line.unitPrice.multiplyByQuantity(line.quantityInvoiced)),
    Money.zero(lines[0].unitPrice.currency),
  );
}

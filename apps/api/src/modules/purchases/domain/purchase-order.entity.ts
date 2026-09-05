import { Money } from '@erp-platform/shared-kernel';

/**
 * Purchase Order (master doc §10, step 3 — Purchases, Stage 4). The
 * formal commitment to buy from one supplier at agreed prices — either
 * converted 1:1 from a 'selected' supplier quotation, or created
 * directly when no formal RFQ was needed.
 */
export type PurchaseOrderStatus =
  | 'draft'
  | 'confirmed'
  | 'partially_received'
  | 'fully_received'
  | 'cancelled';

export interface PurchaseOrderLine {
  id: string;
  purchaseOrderId: string;
  productVariantId: string;
  quantity: number;
  unitPrice: Money;
  notes: string | null;
  createdAt: Date;
}

export interface PurchaseOrder {
  id: string;
  poNumber: string;
  supplierId: string;
  sourceQuotationId: string | null;
  status: PurchaseOrderStatus;
  expectedDeliveryDate: string | null;
  notes: string | null;
  customFields: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface PurchaseOrderWithLines extends PurchaseOrder {
  lines: PurchaseOrderLine[];
  /** Derived, never stored — see migration 0032's class comment. */
  totalAmount: Money;
}

export interface CreatePurchaseOrderLineInput {
  productVariantId: string;
  quantity: number;
  unitPrice: Money;
  notes?: string | null;
}

/**
 * Exactly one of two shapes: give sourceQuotationId (supplierId/lines are
 * derived from that 'selected' quotation and must be omitted), or give
 * supplierId + lines directly (no RFQ involved). Enforced at runtime by
 * PurchaseOrdersService.create(), not by the type system.
 */
export interface CreatePurchaseOrderInput {
  sourceQuotationId?: string | null;
  supplierId?: string;
  lines?: CreatePurchaseOrderLineInput[];
  expectedDeliveryDate?: string | null;
  notes?: string | null;
  customFields?: Record<string, unknown>;
}

/** Header + wholesale line replacement — only while still 'draft'. */
export interface UpdatePurchaseOrderInput {
  expectedDeliveryDate?: string | null;
  notes?: string | null;
  customFields?: Record<string, unknown>;
  lines?: CreatePurchaseOrderLineInput[];
}

/** All lines on one purchase order must share a currency (one PO, one currency — matches accounting practice). */
export function assertSingleCurrency(lines: { unitPrice: Money }[]): void {
  const currencies = new Set(lines.map((l) => l.unitPrice.currency));
  if (currencies.size > 1) {
    throw new Error(
      `A purchase order's lines must all use the same currency (found: ${[...currencies].join(', ')}).`,
    );
  }
}

export function calculatePurchaseOrderTotal(lines: { unitPrice: Money; quantity: number }[]): Money {
  if (lines.length === 0) {
    throw new Error('Cannot compute a purchase order total with zero lines.');
  }
  return lines.reduce(
    (total, line) => total.add(line.unitPrice.multiplyByQuantity(line.quantity)),
    Money.zero(lines[0].unitPrice.currency),
  );
}

import { Money } from '@erp-platform/shared-kernel';

/**
 * Sales Order (master doc §10, step 4 — Sales, Stage 3). The formal
 * commitment from a customer — mirror image of Purchase Order in
 * Purchases; see migration 0042's comment for the two creation paths
 * and the deliberately-simple status set.
 */
/**
 * 'partially_delivered'/'fully_delivered' are set only by
 * DeliveriesService.confirm() (migration 0043) — mirrors
 * PurchaseOrderStatus's identical extension once Goods Receipts
 * existed. Nothing else sets them.
 */
export type SalesOrderStatus =
  | 'draft'
  | 'confirmed'
  | 'partially_delivered'
  | 'fully_delivered'
  | 'cancelled';

export interface SalesOrderLine {
  id: string;
  salesOrderId: string;
  productVariantId: string;
  quantity: number;
  unitPrice: Money;
  notes: string | null;
  createdAt: Date;
}

export interface SalesOrder {
  id: string;
  soNumber: string;
  customerId: string;
  sourceQuotationId: string | null;
  status: SalesOrderStatus;
  notes: string | null;
  customFields: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface SalesOrderWithLines extends SalesOrder {
  lines: SalesOrderLine[];
  /** Derived, never stored — see migration 0042's class comment. */
  totalAmount: Money;
}

export interface CreateSalesOrderLineInput {
  productVariantId: string;
  quantity: number;
  unitPrice: Money;
  notes?: string | null;
}

/**
 * Exactly one of two shapes: give sourceQuotationId (customerId/lines
 * are derived from that 'accepted' quotation and must be omitted), or
 * give customerId + lines directly (no quotation involved). Enforced at
 * runtime by SalesOrdersService.create() — same pattern as
 * CreatePurchaseOrderInput.
 */
export interface CreateSalesOrderInput {
  sourceQuotationId?: string | null;
  customerId?: string;
  lines?: CreateSalesOrderLineInput[];
  notes?: string | null;
  customFields?: Record<string, unknown>;
}

/** Header + wholesale line replacement — only while still 'draft'. */
export interface UpdateSalesOrderInput {
  notes?: string | null;
  customFields?: Record<string, unknown>;
  lines?: CreateSalesOrderLineInput[];
}

/** All lines on one sales order must share a currency — same rule as Purchase Orders/Quotations. */
export function assertSingleCurrency(lines: { unitPrice: Money }[]): void {
  const currencies = new Set(lines.map((l) => l.unitPrice.currency));
  if (currencies.size > 1) {
    throw new Error(
      `A sales order's lines must all use the same currency (found: ${[...currencies].join(', ')}).`,
    );
  }
}

export function calculateSalesOrderTotal(lines: { unitPrice: Money; quantity: number }[]): Money {
  if (lines.length === 0) {
    throw new Error('Cannot compute a sales order total with zero lines.');
  }
  return lines.reduce(
    (total, line) => total.add(line.unitPrice.multiplyByQuantity(line.quantity)),
    Money.zero(lines[0].unitPrice.currency),
  );
}

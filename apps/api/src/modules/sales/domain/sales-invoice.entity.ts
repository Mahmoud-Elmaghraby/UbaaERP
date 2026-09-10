import { Money } from '@erp-platform/shared-kernel';

/**
 * Sales Invoice (master doc §10, step 4 — Sales, Stage 5). This
 * module's first genuinely financial document — posting one (not
 * creating it — see SalesInvoicesService.post()) writes to the
 * Outbox Pattern (CLAUDE.md §2.7), not just the plain Event Bus every
 * earlier Sales stage uses. Also the document the ETA e-invoice
 * submission engine will eventually attach to
 * (claude/sales-einvoice-spike.md §6) — that engine is not built here.
 */
export type SalesInvoiceStatus = 'draft' | 'posted' | 'cancelled';

export interface SalesInvoiceLine {
  id: string;
  salesInvoiceId: string;
  salesOrderLineId: string;
  productVariantId: string;
  quantityInvoiced: number;
  unitPrice: Money;
  notes: string | null;
  createdAt: Date;
}

export interface SalesInvoice {
  id: string;
  invoiceNumber: string;
  salesOrderId: string;
  status: SalesInvoiceStatus;
  invoiceDate: string | null;
  dueDate: string | null;
  notes: string | null;
  customFields: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface SalesInvoiceWithLines extends SalesInvoice {
  lines: SalesInvoiceLine[];
  /** Derived, never stored — see migration 0045's class comment. */
  totalAmount: Money;
}

/** productVariantId is always derived server-side from salesOrderLineId. unitPrice defaults to that SO line's price when omitted. */
export interface CreateSalesInvoiceLineInput {
  salesOrderLineId: string;
  quantityInvoiced: number;
  unitPrice?: Money;
  notes?: string | null;
}

/**
 * The alternative to a pre-existing salesOrderId — the invoice-takeover
 * orchestrator's entry point (claude/platform-flexibility-strategy.md).
 * Used only when Sales Orders is not effectively enabled for the tenant;
 * SalesInvoicesService.create() rejects this path otherwise, so a tenant
 * that keeps Sales Orders enabled can't have staff route around its own
 * configured workflow. Unlike CreateSalesInvoiceLineInput, there is no
 * existing sales order line to derive productVariantId/unitPrice from —
 * both are given directly, same shape as CreateSalesOrderLineInput.
 */
export interface CreateSalesInvoiceDirectLineInput {
  productVariantId: string;
  quantity: number;
  unitPrice: Money;
  notes?: string | null;
}

export interface CreateSalesInvoiceInput {
  /** Provide this (with `lines`), OR `customerId` + `directLines` — not both. */
  salesOrderId?: string;
  lines?: CreateSalesInvoiceLineInput[];
  /** Direct-invoicing path — see CreateSalesInvoiceDirectLineInput. */
  customerId?: string;
  directLines?: CreateSalesInvoiceDirectLineInput[];
  /**
   * Required whenever a Delivery must be created behind the scenes —
   * either because Deliveries is not effectively enabled for the tenant
   * (the invoice absorbs its role, same "closest active document" rule),
   * or because the direct-invoicing path always needs one. Ignored
   * otherwise.
   */
  warehouseId?: string;
  invoiceDate?: string | null;
  dueDate?: string | null;
  notes?: string | null;
  customFields?: Record<string, unknown>;
}

/** All lines on one sales invoice must share a currency — same rule and rationale as sales_orders. */
export function assertSingleCurrency(lines: { unitPrice: Money }[]): void {
  const currencies = new Set(lines.map((l) => l.unitPrice.currency));
  if (currencies.size > 1) {
    throw new Error(
      `A sales invoice's lines must all use the same currency (found: ${[...currencies].join(', ')}).`,
    );
  }
}

export function calculateSalesInvoiceTotal(lines: { unitPrice: Money; quantityInvoiced: number }[]): Money {
  if (lines.length === 0) {
    throw new Error('Cannot compute a sales invoice total with zero lines.');
  }
  return lines.reduce(
    (total, line) => total.add(line.unitPrice.multiplyByQuantity(line.quantityInvoiced)),
    Money.zero(lines[0].unitPrice.currency),
  );
}

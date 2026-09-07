import type { Money } from '@erp-platform/shared-kernel';
import type { DiscountType } from './sales-order.entity';
import type { SalesOrderWithLines } from './sales-order.entity';
import type { DeliveryWithLines } from './delivery.entity';
import type { SalesInvoiceWithLines } from './sales-invoice.entity';
import type { PaymentMethod, PaymentReceivedWithAllocations } from './payment-received.entity';

/**
 * POS Checkout (CLAUDE.md §10 — step 4, Sales — POS feature, Stage 3;
 * see claude/sales-pos-research.md). Not a new persisted document — the
 * checkout call is a single orchestration that creates/confirms/posts
 * the existing Sales Order → Delivery → Sales Invoice → Payment(s)
 * Received chain atomically, tagging the payment(s) with the POS
 * session they belong to. PosSalesService.checkout() is the only
 * consumer of these shapes.
 *
 * Every field here mirrors the equivalent Sales Order concept
 * (Discountable line/header discounts, multi-line, single-currency) —
 * checkout() does not invent its own pricing rules, it reuses
 * sales-order.entity.ts's calculateSalesOrderTotal()/
 * distributeOrderTotalAcrossLines() so a POS sale and a manually-built
 * Sales Order price identically for the same inputs.
 */
export interface PosCheckoutLineInput {
  productVariantId: string;
  quantity: number;
  /** Gross, pre-discount unit price — same meaning as CreateSalesOrderLineInput.unitPrice. */
  unitPrice: Money;
  discountType?: DiscountType | null;
  discountPercentage?: number | null;
  discountFixedAmount?: Money | null;
  notes?: string | null;
}

/**
 * One tender (cash/card/etc.) applied to the sale. Split/multi-tender
 * (research doc decision #3) is just more than one entry here — each
 * becomes its own payments_received row, all allocated to the same
 * invoice, exactly like a human cashier splitting a bill today already
 * supports via the general Payments Received API's multi-row-per-
 * invoice allocation.
 */
export interface PosCheckoutTenderInput {
  paymentMethod: PaymentMethod;
  amount: Money;
  referenceNumber?: string | null;
}

/**
 * customerId omitted (or null) resolves to the tenant's seeded Walk-in
 * Customer (migration 0063, research doc decision #6) — the normal POS
 * path where no specific customer is looked up. warehouseId is NOT a
 * field here: it comes from the POS session itself (pos_sessions.
 * warehouse_id, migration 0064), resolved once at session-open time —
 * see that migration's comment for why checkout never takes its own.
 */
export interface PosCheckoutInput {
  customerId?: string | null;
  lines: PosCheckoutLineInput[];
  discountType?: DiscountType | null;
  discountPercentage?: number | null;
  discountFixedAmount?: Money | null;
  tenders: PosCheckoutTenderInput[];
  notes?: string | null;
}

/** Every step's own result, for a receipt/confirmation screen to render without a second round-trip. */
export interface PosCheckoutResult {
  salesOrder: SalesOrderWithLines;
  delivery: DeliveryWithLines;
  salesInvoice: SalesInvoiceWithLines;
  payments: PaymentReceivedWithAllocations[];
}

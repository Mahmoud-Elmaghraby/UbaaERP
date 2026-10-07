import { Money } from '@erp-platform/shared-kernel';

/**
 * Sales Order (master doc §10, step 4 — Sales, Stage 3). The formal
 * commitment from a customer — mirror image of Purchase Order in
 * Purchases; see migration 0042's comment for the two creation paths
 * and the deliberately-simple status set.
 *
 * Discounts (POS feature Stage 2, claude/sales-pos-research.md) —
 * migration 0062: both the header and each line can carry at most one
 * discount, either a percentage or a fixed amount (never both — see
 * that migration's own consistency CHECK). `currency` (header-only) is
 * populated once at creation from the order's own lines
 * (assertSingleCurrency already guarantees they share one) — see
 * migration 0062's comment for why a header-level fixed discount needs
 * this to become a Money value at all.
 */
export type SalesOrderStatus =
  | 'draft'
  | 'confirmed'
  | 'partially_delivered'
  | 'fully_delivered'
  | 'cancelled';

export type DiscountType = 'percentage' | 'fixed';

/** Shared shape for both a sales order header and one of its lines — enough for applyDiscount()/calculateLineNetAmount() to work generically. */
export interface Discountable {
  discountType?: DiscountType | null;
  discountPercentage?: number | null;
  discountFixedAmount?: Money | null;
}

export interface SalesOrderLine extends Discountable {
  id: string;
  salesOrderId: string;
  productVariantId: string;
  quantity: number;
  unitPrice: Money;
  notes: string | null;
  createdAt: Date;
  /** Unit the line is in (null = product base unit) and base units per 1 of it — migration 0079. */
  unitOfMeasureId: string | null;
  unitFactor: number;
}

export interface SalesOrder extends Discountable {
  id: string;
  soNumber: string;
  customerId: string;
  sourceQuotationId: string | null;
  status: SalesOrderStatus;
  /** Populated from the order's own lines at creation time — see this file's own comment and migration 0062's. Null only for orders created before that migration. */
  currency: string | null;
  notes: string | null;
  customFields: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface SalesOrderWithLines extends SalesOrder {
  lines: SalesOrderLine[];
  /** Derived, never stored: sum of each line's net-of-line-discount amount, BEFORE the header-level discount. */
  subtotalAmount: Money;
  /** Derived, never stored: subtotalAmount with the header-level discount (if any) applied — the actual amount owed. */
  totalAmount: Money;
}

export interface CreateSalesOrderLineInput extends Discountable {
  productVariantId: string;
  quantity: number;
  unitPrice: Money;
  notes?: string | null;
  /** Line unit (migration 0079); omitted = base unit, factor 1. */
  unitOfMeasureId?: string | null;
  unitFactor?: number;
}

/**
 * Exactly one of two shapes: give sourceQuotationId (customerId/lines
 * are derived from that 'accepted' quotation and must be omitted), or
 * give customerId + lines directly (no quotation involved). Enforced at
 * runtime by SalesOrdersService.create() — same pattern as
 * CreatePurchaseOrderInput. Header-level discount fields (Discountable)
 * apply regardless of which path is used.
 */
export interface CreateSalesOrderInput extends Discountable {
  sourceQuotationId?: string | null;
  customerId?: string;
  lines?: CreateSalesOrderLineInput[];
  notes?: string | null;
  customFields?: Record<string, unknown>;
}

/** Header + wholesale line replacement — only while still 'draft'. */
export interface UpdateSalesOrderInput extends Discountable {
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

/**
 * Applies at most one discount (percentage or fixed) to `amount`. Pure
 * and generic — used for both a line's own discount (against its gross
 * line amount) and a sales order's header discount (against the sum of
 * already-line-discounted amounts, i.e. subtotalAmount).
 */
function applyDiscount(amount: Money, discount: Discountable): Money {
  if (!discount.discountType) return amount;

  if (discount.discountType === 'percentage') {
    if (discount.discountPercentage == null) {
      throw new Error('discountPercentage is required when discountType is "percentage".');
    }
    const discountAmount = amount.multiplyByQuantity(discount.discountPercentage / 100);
    return amount.subtract(discountAmount);
  }

  if (!discount.discountFixedAmount) {
    throw new Error('discountFixedAmount is required when discountType is "fixed".');
  }
  if (discount.discountFixedAmount.greaterThan(amount)) {
    throw new Error(
      `A fixed discount of ${discount.discountFixedAmount.toDecimalString()} cannot exceed the ` +
        `${amount.toDecimalString()} it discounts.`,
    );
  }
  return amount.subtract(discount.discountFixedAmount);
}

/** One line's net amount: gross (unitPrice × quantity) with that line's own discount, if any, applied. */
export function calculateLineNetAmount(line: { unitPrice: Money; quantity: number } & Discountable): Money {
  const gross = line.unitPrice.multiplyByQuantity(line.quantity);
  return applyDiscount(gross, line);
}

/**
 * subtotalAmount = sum of every line's net amount (each line's own
 * discount already applied). totalAmount = subtotalAmount with the
 * header-level discount (if any) applied on top. This is the one place
 * both discount levels compose — see SalesOrderWithLines' own comment
 * for what each derived field means.
 */
export function calculateSalesOrderTotal(
  order: Discountable,
  lines: ({ unitPrice: Money; quantity: number } & Discountable)[],
): { subtotalAmount: Money; totalAmount: Money } {
  if (lines.length === 0) {
    throw new Error('Cannot compute a sales order total with zero lines.');
  }
  const subtotalAmount = lines.reduce(
    (total, line) => total.add(calculateLineNetAmount(line)),
    Money.zero(lines[0].unitPrice.currency),
  );
  const totalAmount = applyDiscount(subtotalAmount, order);
  return { subtotalAmount, totalAmount };
}

/**
 * POS feature Stage 3 (claude/sales-pos-research.md). Splits the
 * order's FULL total — both this line's own discount AND the
 * header-level discount, already combined — across its lines, so a
 * consumer with no header-discount concept of its own (Sales Invoice:
 * each line only ever charges quantity × unitPrice, there is no
 * separate document-level discount field and no synthetic "discount"
 * line since every invoice line must map back to a real
 * sales_order_line) can still charge the CORRECT total for the order
 * as a whole, not just each line's own line-level discount.
 *
 * Each line's returned amount = round(lineNetAmount × totalAmount ÷
 * subtotalAmount) using the largest-remainder method, so the SUM of
 * every returned amount is EXACTLY totalAmount in minor units — never
 * a fractional-cent short or over, regardless of how the header
 * discount percentage divides. Ties in the remainder are broken by
 * original line order, so the result is deterministic.
 *
 * Returned in the same order as `lines`. When there is no header-level
 * discount, totalAmount === subtotalAmount and every line's returned
 * amount equals its own calculateLineNetAmount() unchanged.
 *
 * Known, bounded limitation: converting one of these target line
 * TOTALS into a per-unit price (targetTotal.divideByQuantity(quantity))
 * for a line whose quantity does not evenly divide it can round to a
 * per-unit price that, multiplied back out, is off by a single minor
 * unit for THAT line — the same rounding tolerance multiplyByQuantity/
 * divideByQuantity already accept everywhere else in this codebase, not
 * a new imprecision introduced here. The order-level total this
 * function guarantees (the sum across all lines) stays exact.
 */
export function distributeOrderTotalAcrossLines(
  order: Discountable,
  lines: ({ unitPrice: Money; quantity: number } & Discountable)[],
): Money[] {
  if (lines.length === 0) {
    throw new Error('Cannot distribute a sales order total with zero lines.');
  }
  const { subtotalAmount, totalAmount } = calculateSalesOrderTotal(order, lines);
  const currency = subtotalAmount.currency;
  const subtotalMinor = subtotalAmount.toMinorUnits();
  const totalMinor = totalAmount.toMinorUnits();

  if (subtotalMinor === 0n) {
    // Every line nets to zero — applyDiscount() never lets a discount push a total
    // negative, so totalMinor must be 0n here too. Nothing to distribute.
    return lines.map(() => Money.zero(currency));
  }

  const shares = lines.map((line) => {
    const lineNetMinor = calculateLineNetAmount(line).toMinorUnits();
    const product = lineNetMinor * totalMinor;
    return { floor: product / subtotalMinor, remainder: product % subtotalMinor };
  });

  let leftover = totalMinor - shares.reduce((sum, share) => sum + share.floor, 0n);

  const byRemainderDesc = shares
    .map((share, index) => ({ index, remainder: share.remainder }))
    .sort((a, b) => (b.remainder > a.remainder ? 1 : b.remainder < a.remainder ? -1 : a.index - b.index));

  const extra = new Array<bigint>(lines.length).fill(0n);
  for (const { index } of byRemainderDesc) {
    if (leftover <= 0n) break;
    extra[index] = 1n;
    leftover -= 1n;
  }

  return shares.map((share, i) => Money.fromMinorUnits(share.floor + extra[i], currency));
}

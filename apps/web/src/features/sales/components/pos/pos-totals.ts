import type { DiscountDraft } from '../../lib/discount-fields';

/**
 * POS Stage 4 (claude/sales-pos-research.md) — running-total preview for the cart
 * UI only. The authoritative per-line net amounts, header-discount distribution,
 * and final invoice total are always computed server-side by the Money Value
 * Object (see sales-order.entity.ts's distributeOrderTotalAcrossLines(), Stage 3)
 * and returned by POST /pos-sessions/:id/checkout — this file is never used to
 * build the checkout request body (that still goes through resolveDiscountInput()
 * + decimalToMinorUnits() exactly like the Sales Order form, see pos-cart-panel.tsx).
 *
 * It deliberately uses plain floating-point number math rather than the app's
 * BigInt-based Money helpers: quantity here is a plain fractional JS number (the
 * same shape the backend's own CreateSalesOrderLineDto.quantity accepts), and there
 * is no BigInt-safe way to multiply a BigInt minor-units amount by a fractional
 * quantity without re-implementing decimal arithmetic. Since this number is only
 * ever displayed — never submitted, never persisted — an imprecise preview here
 * cannot corrupt any financial record; it exists purely so the cashier sees a
 * running total before pressing "checkout".
 */
export function previewLineAmount(unitPrice: string, quantity: string): number {
  const price = Number(unitPrice);
  const qty = Number(quantity);
  if (!Number.isFinite(price) || !Number.isFinite(qty)) return 0;
  return price * qty;
}

export function previewDiscountedAmount(baseAmount: number, discount: DiscountDraft): number {
  if (discount.discountType === 'percentage') {
    const pct = Number(discount.discountPercentage);
    if (!Number.isFinite(pct)) return baseAmount;
    return baseAmount - baseAmount * (pct / 100);
  }
  if (discount.discountType === 'fixed') {
    const fixed = Number(discount.discountFixedAmount);
    if (!Number.isFinite(fixed)) return baseAmount;
    return Math.max(0, baseAmount - fixed);
  }
  return baseAmount;
}

export function formatPreviewAmount(amount: number, currency: string): string {
  return `${amount.toFixed(2)} ${currency}`;
}

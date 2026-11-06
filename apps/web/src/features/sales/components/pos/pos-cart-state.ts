import type { DiscountDraft } from '../../lib/discount-fields';

export interface CartLine {
  key: string;
  productVariantId: string;
  /** Line unit (carton…); null = the product's base unit. */
  unitOfMeasureId: string | null;
  label: string;
  quantity: string;
  unitPrice: string;
  discount: DiscountDraft;
}

/** What a parked sale stores (POST /pos/sessions/:id/held-carts `payload`) — enough to restore the cart exactly. */
export interface HeldCartPayload {
  v: 1;
  lines: Array<Omit<CartLine, 'key'>>;
  /** null = the walk-in customer. */
  customerId: string | null;
  priceListId: string | null;
  headerDiscount: DiscountDraft;
  notes: string;
}

let nextKey = 0;
export function makeKey(prefix: string): string {
  nextKey += 1;
  return `${prefix}-${nextKey}`;
}

export function toHeldPayload(state: Omit<HeldCartPayload, 'v' | 'lines'> & { lines: CartLine[] }): HeldCartPayload {
  return {
    v: 1,
    lines: state.lines.map((line) => ({
      productVariantId: line.productVariantId,
      unitOfMeasureId: line.unitOfMeasureId,
      label: line.label,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      discount: line.discount,
    })),
    customerId: state.customerId,
    priceListId: state.priceListId,
    headerDiscount: state.headerDiscount,
    notes: state.notes,
  };
}

function isDiscount(value: unknown): value is DiscountDraft {
  const d = value as DiscountDraft | null;
  return Boolean(d) && typeof d!.discountType === 'string';
}

/** A held cart's payload back to cart state; null when it isn't one this till wrote. */
export function fromHeldPayload(payload: Record<string, unknown>): (Omit<HeldCartPayload, 'v' | 'lines'> & { lines: CartLine[] }) | null {
  if (payload.v !== 1 || !Array.isArray(payload.lines)) return null;
  const lines: CartLine[] = [];
  for (const raw of payload.lines as Array<Record<string, unknown>>) {
    if (!raw || typeof raw.productVariantId !== 'string') return null;
    lines.push({
      key: makeKey('line'),
      productVariantId: raw.productVariantId,
      unitOfMeasureId: typeof raw.unitOfMeasureId === 'string' ? raw.unitOfMeasureId : null,
      label: typeof raw.label === 'string' ? raw.label : '',
      quantity: String(raw.quantity ?? '1'),
      unitPrice: String(raw.unitPrice ?? ''),
      discount: isDiscount(raw.discount)
        ? raw.discount
        : { discountType: 'none', discountPercentage: '', discountFixedAmount: '' },
    });
  }
  return {
    lines,
    customerId: typeof payload.customerId === 'string' ? payload.customerId : null,
    priceListId: typeof payload.priceListId === 'string' ? payload.priceListId : null,
    headerDiscount: isDiscount(payload.headerDiscount)
      ? payload.headerDiscount
      : { discountType: 'none', discountPercentage: '', discountFixedAmount: '' },
    notes: typeof payload.notes === 'string' ? payload.notes : '',
  };
}

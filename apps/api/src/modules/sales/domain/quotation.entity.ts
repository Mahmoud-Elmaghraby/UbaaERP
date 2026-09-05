import { Money } from '@erp-platform/shared-kernel';

/**
 * Quotation (master doc §10, step 4 — Sales, Stage 2). The first Sales
 * document that carries a real price — structurally the mirror image of
 * Purchase Order (Purchases), not Purchase Requisition/RFQ; see
 * migration 0041's comment for why.
 */
export type QuotationStatus = 'draft' | 'sent' | 'accepted' | 'rejected' | 'cancelled';

export interface QuotationLine {
  id: string;
  quotationId: string;
  productVariantId: string;
  quantity: number;
  unitPrice: Money;
  notes: string | null;
  createdAt: Date;
}

export interface Quotation {
  id: string;
  quotationNumber: string;
  customerId: string;
  status: QuotationStatus;
  validUntilDate: string | null;
  notes: string | null;
  customFields: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface QuotationWithLines extends Quotation {
  lines: QuotationLine[];
  /** Derived, never stored — see migration 0041's class comment. */
  totalAmount: Money;
}

export interface CreateQuotationLineInput {
  productVariantId: string;
  quantity: number;
  unitPrice: Money;
  notes?: string | null;
}

export interface CreateQuotationInput {
  customerId: string;
  lines: CreateQuotationLineInput[];
  validUntilDate?: string | null;
  notes?: string | null;
  customFields?: Record<string, unknown>;
}

/** Header + wholesale line replacement — only while still 'draft', same as Purchase Orders. */
export interface UpdateQuotationInput {
  validUntilDate?: string | null;
  notes?: string | null;
  customFields?: Record<string, unknown>;
  lines?: CreateQuotationLineInput[];
}

/** All lines on one quotation must share a currency — same rule and reasoning as Purchase Orders. */
export function assertSingleCurrency(lines: { unitPrice: Money }[]): void {
  const currencies = new Set(lines.map((l) => l.unitPrice.currency));
  if (currencies.size > 1) {
    throw new Error(
      `A quotation's lines must all use the same currency (found: ${[...currencies].join(', ')}).`,
    );
  }
}

export function calculateQuotationTotal(lines: { unitPrice: Money; quantity: number }[]): Money {
  if (lines.length === 0) {
    throw new Error('Cannot compute a quotation total with zero lines.');
  }
  return lines.reduce(
    (total, line) => total.add(line.unitPrice.multiplyByQuantity(line.quantity)),
    Money.zero(lines[0].unitPrice.currency),
  );
}

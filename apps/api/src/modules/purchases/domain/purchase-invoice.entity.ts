import { Money } from '@erp-platform/shared-kernel';
import { documentTotals, type DocumentTotals, type LineTaxSnapshot } from '../../../shared/taxes/line-tax-snapshot';
import type { ReceiptLot } from './goods-receipt.entity';

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
  /** Migration 0092: amount before taxes (unit price × quantity, or backed out of a tax-inclusive price). */
  netAmount: Money;
  /** Migration 0092: the line's taxes as computed when the invoice was created. */
  taxes: LineTaxSnapshot[];
  notes: string | null;
  createdAt: Date;
  /** Unit the line is in (null = product base unit) and base units per 1 of it — migration 0079. */
  unitOfMeasureId: string | null;
  unitFactor: number;
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
  /** Migration 0092: unit prices were entered including VAT/table tax. */
  pricesIncludeTax: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/** Totals are derived from the lines, never stored — see migration 0038's class comment. */
export interface PurchaseInvoiceWithLines extends PurchaseInvoice, DocumentTotals {
  lines: PurchaseInvoiceLine[];
}

/** productVariantId is always derived server-side from purchaseOrderLineId. unitPrice defaults to that PO line's price when omitted. */
export interface CreatePurchaseInvoiceLineInput {
  purchaseOrderLineId: string;
  quantityInvoiced: number;
  unitPrice?: Money;
  /** Omitted = defaults (product VAT + supplier withholding); [] = untaxed. */
  taxRuleIds?: string[];
  notes?: string | null;
  /** Lots/serials, passed to the goods receipt created behind the scenes when Goods Receipts is off. */
  lots?: ReceiptLot[];
}

/**
 * The alternative to a pre-existing purchaseOrderId — the invoice-takeover
 * orchestrator's entry point (claude/platform-flexibility-strategy.md),
 * mirroring CreateSalesInvoiceDirectLineInput. Used only when Purchase
 * Orders is not effectively enabled for the tenant;
 * PurchaseInvoicesService.create() rejects this path otherwise. Unlike
 * CreatePurchaseInvoiceLineInput, there is no existing purchase order line
 * to derive productVariantId/unitPrice from — both are given directly,
 * same shape as CreatePurchaseOrderLineInput.
 */
export interface CreatePurchaseInvoiceDirectLineInput {
  productVariantId: string;
  quantityInvoiced: number;
  unitPrice: Money;
  taxRuleIds?: string[];
  notes?: string | null;
  /** See CreatePurchaseInvoiceLineInput.lots. */
  lots?: ReceiptLot[];
  /** Line unit (migration 0079); omitted = base unit. */
  unitOfMeasureId?: string | null;
}

export interface CreatePurchaseInvoiceInput {
  /** Provide this (with `lines`), OR `supplierId` + `directLines` — not both. */
  purchaseOrderId?: string;
  lines?: CreatePurchaseInvoiceLineInput[];
  /** Direct-invoicing path — see CreatePurchaseInvoiceDirectLineInput. */
  supplierId?: string;
  directLines?: CreatePurchaseInvoiceDirectLineInput[];
  /**
   * Required whenever a Goods Receipt must be created behind the scenes —
   * either because Goods Receipts is not effectively enabled for the
   * tenant (the invoice absorbs its role, same "closest active document"
   * rule), or because the direct-invoicing path always needs one. Ignored
   * otherwise.
   */
  warehouseId?: string;
  supplierInvoiceNumber?: string | null;
  invoiceDate?: string | null;
  dueDate?: string | null;
  pricesIncludeTax?: boolean;
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

/** Net, taxes and total of an invoice from its stored lines. */
export function calculatePurchaseInvoiceTotals(
  lines: readonly Pick<PurchaseInvoiceLine, 'netAmount' | 'taxes'>[],
): DocumentTotals {
  if (lines.length === 0) throw new Error('Cannot compute a purchase invoice total with zero lines.');
  return documentTotals(lines);
}

/** What we owe the supplier: net + table tax + VAT − the withholding we keep for the tax authority. */
export function calculatePurchaseInvoiceTotal(lines: readonly Pick<PurchaseInvoiceLine, 'netAmount' | 'taxes'>[]): Money {
  return calculatePurchaseInvoiceTotals(lines).totalAmount;
}

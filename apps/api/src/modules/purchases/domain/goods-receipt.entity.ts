import { Money } from '@erp-platform/shared-kernel';

/**
 * Goods Receipt (master doc §10, step 3 — Purchases, Stage 5). Records
 * physical receipt of goods against a purchase order. Confirming one
 * (not creating it — see GoodsReceiptsService.confirm()) is what
 * actually moves stock, via the Event Bus (CLAUDE.md §2.6) — never a
 * direct call into Inventory.
 */
export type GoodsReceiptStatus = 'draft' | 'confirmed' | 'cancelled';

/**
 * How a received quantity splits across lots/serials (migration 0077).
 * Required for lot/serial-tracked items; empty for everything else.
 */
export interface ReceiptLot {
  lotNumber: string;
  /** ISO date (YYYY-MM-DD) or null when the lot has no expiry. */
  expiryDate: string | null;
  quantity: number;
}

export interface GoodsReceiptLine {
  id: string;
  goodsReceiptId: string;
  purchaseOrderLineId: string;
  productVariantId: string;
  quantityReceived: number;
  unitCost: Money;
  notes: string | null;
  lots: ReceiptLot[];
  createdAt: Date;
  /** Unit the line is in (null = product base unit) and base units per 1 of it — migration 0079. */
  unitOfMeasureId: string | null;
  unitFactor: number;
}

export interface GoodsReceipt {
  id: string;
  receiptNumber: string;
  purchaseOrderId: string;
  warehouseId: string;
  status: GoodsReceiptStatus;
  receivedDate: string | null;
  notes: string | null;
  customFields: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface GoodsReceiptWithLines extends GoodsReceipt {
  lines: GoodsReceiptLine[];
}

/**
 * productVariantId is deliberately not part of this input — it's always
 * derived server-side from purchaseOrderLineId, so a receipt line can
 * never point at a different product than the PO line it claims to
 * fulfil. unitCost defaults to the PO line's unit price when omitted
 * (see GoodsReceiptsService.create()).
 */
export interface CreateGoodsReceiptLineInput {
  purchaseOrderLineId: string;
  quantityReceived: number;
  unitCost?: Money;
  notes?: string | null;
  lots?: ReceiptLot[];
}

export interface CreateGoodsReceiptInput {
  purchaseOrderId: string;
  warehouseId: string;
  lines: CreateGoodsReceiptLineInput[];
  receivedDate?: string | null;
  notes?: string | null;
  customFields?: Record<string, unknown>;
}

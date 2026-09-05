/**
 * Purchase Return (master doc §10, step 3 — Purchases, Stage 6; the
 * second approved research-pass addition). Records goods physically
 * sent back to a supplier after a confirmed goods receipt — see
 * migration 0036's class comment for why this is deliberately scoped to
 * the physical/operational return, not a financial debit note.
 */
export type PurchaseReturnStatus = 'draft' | 'confirmed' | 'cancelled';

export interface PurchaseReturnLine {
  id: string;
  purchaseReturnId: string;
  goodsReceiptLineId: string;
  productVariantId: string;
  quantityReturned: number;
  reason: string | null;
  notes: string | null;
  createdAt: Date;
}

export interface PurchaseReturn {
  id: string;
  returnNumber: string;
  goodsReceiptId: string;
  status: PurchaseReturnStatus;
  returnDate: string | null;
  notes: string | null;
  customFields: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface PurchaseReturnWithLines extends PurchaseReturn {
  lines: PurchaseReturnLine[];
}

/**
 * Returned by PurchaseReturnsService.confirm() only — carries the
 * originating goods receipt's warehouseId alongside the confirmed
 * return, purely so the controller can build the Event Bus payload
 * (PurchaseReturnStockListener needs to know which warehouse/location to
 * decrease) without a second round trip. Not a stored/domain field of
 * PurchaseReturn itself — see migration 0036 on why warehouse is never
 * duplicated onto this table.
 */
export interface PurchaseReturnConfirmation extends PurchaseReturnWithLines {
  warehouseId: string;
}

/** productVariantId is always derived server-side from goodsReceiptLineId, never taken from the caller. */
export interface CreatePurchaseReturnLineInput {
  goodsReceiptLineId: string;
  quantityReturned: number;
  reason?: string | null;
  notes?: string | null;
}

export interface CreatePurchaseReturnInput {
  goodsReceiptId: string;
  lines: CreatePurchaseReturnLineInput[];
  returnDate?: string | null;
  notes?: string | null;
  customFields?: Record<string, unknown>;
}

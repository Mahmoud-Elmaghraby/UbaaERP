/**
 * Sales Return (master doc §10, step 4 — Sales, Stage 7; the approved
 * research-pass addition — claude/sales-module-research.md). Records
 * goods physically sent back by a customer after a confirmed delivery —
 * see migration 0047's class comment for why this is deliberately
 * scoped to the physical/operational return, not a financial credit
 * note.
 */
export type SalesReturnStatus = 'draft' | 'confirmed' | 'cancelled';

export interface SalesReturnLine {
  id: string;
  salesReturnId: string;
  deliveryLineId: string;
  productVariantId: string;
  quantityReturned: number;
  reason: string | null;
  notes: string | null;
  createdAt: Date;
}

export interface SalesReturn {
  id: string;
  returnNumber: string;
  deliveryId: string;
  status: SalesReturnStatus;
  returnDate: string | null;
  notes: string | null;
  customFields: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface SalesReturnWithLines extends SalesReturn {
  lines: SalesReturnLine[];
}

/**
 * Returned by SalesReturnsService.confirm() only — carries the
 * originating delivery's warehouseId alongside the confirmed return,
 * purely so the controller can build the Event Bus payload
 * (SalesReturnStockListener needs to know which warehouse/location to
 * increase) without a second round trip. Not a stored/domain field of
 * SalesReturn itself — see migration 0047 on why warehouse is never
 * duplicated onto this table.
 */
export interface SalesReturnConfirmation extends SalesReturnWithLines {
  warehouseId: string;
  /** The sales credit note SalesReturnsService.confirm() auto-generates in the same transaction — see migration 0053. */
  creditNoteId: string;
}

/** productVariantId is always derived server-side from deliveryLineId, never taken from the caller. */
export interface CreateSalesReturnLineInput {
  deliveryLineId: string;
  quantityReturned: number;
  reason?: string | null;
  notes?: string | null;
}

export interface CreateSalesReturnInput {
  deliveryId: string;
  lines: CreateSalesReturnLineInput[];
  returnDate?: string | null;
  notes?: string | null;
  customFields?: Record<string, unknown>;
}

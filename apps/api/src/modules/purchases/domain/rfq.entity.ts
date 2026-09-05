/**
 * Request for Quotation (master doc §10, step 3 — Purchases, Stage 3;
 * approved research-pass addition, see claude/purchases-module-research.md).
 * What WE ask one or more suppliers to quote a price on — the comparison
 * step between a purchase requisition and a purchase order.
 */
export type RfqStatus = 'draft' | 'sent' | 'closed' | 'cancelled';

export interface RfqLine {
  id: string;
  rfqId: string;
  productVariantId: string;
  quantity: number;
  notes: string | null;
  createdAt: Date;
}

export interface Rfq {
  id: string;
  rfqNumber: string;
  sourceRequisitionId: string | null;
  status: RfqStatus;
  notes: string | null;
  customFields: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface RfqWithDetails extends Rfq {
  lines: RfqLine[];
  /** Suppliers invited to quote — who hasn't responded yet is (RfqWithDetails.supplierIds) minus (supplier_quotations for this RFQ). */
  supplierIds: string[];
}

export interface CreateRfqLineInput {
  productVariantId: string;
  quantity: number;
  notes?: string | null;
}

export interface CreateRfqInput {
  sourceRequisitionId?: string | null;
  notes?: string | null;
  customFields?: Record<string, unknown>;
  lines: CreateRfqLineInput[];
  supplierIds: string[];
}

/** Header + line/supplier replacement — only while still 'draft'. */
export interface UpdateRfqInput {
  notes?: string | null;
  customFields?: Record<string, unknown>;
  lines?: CreateRfqLineInput[];
  supplierIds?: string[];
}

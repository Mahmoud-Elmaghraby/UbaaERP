import type { Money } from '@erp-platform/shared-kernel';

/**
 * Supplier Quotation (master doc §10, step 3 — Purchases, Stage 3;
 * approved research-pass addition). What a supplier tells us back after
 * an RFQ — the first Purchases entity to actually carry a price.
 * Deliberately not numbered via Settings' numbering_sequences: it's a
 * record of an inbound document (the supplier's own quote), not
 * something this tenant issues.
 */
export type SupplierQuotationStatus = 'received' | 'selected' | 'rejected';

export interface SupplierQuotationLine {
  id: string;
  quotationId: string;
  productVariantId: string;
  quantity: number;
  unitPrice: Money;
  notes: string | null;
  createdAt: Date;
  /** Unit the line is in (null = product base unit) and base units per 1 of it — migration 0079. */
  unitOfMeasureId: string | null;
  unitFactor: number;
}

export interface SupplierQuotation {
  id: string;
  rfqId: string;
  supplierId: string;
  status: SupplierQuotationStatus;
  validUntil: string | null;
  notes: string | null;
  customFields: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface SupplierQuotationWithLines extends SupplierQuotation {
  lines: SupplierQuotationLine[];
}

export interface CreateSupplierQuotationLineInput {
  productVariantId: string;
  quantity: number;
  unitPrice: Money;
  notes?: string | null;
  /** Line unit (migration 0079); omitted = base unit, factor 1. */
  unitOfMeasureId?: string | null;
  unitFactor?: number;
}

export interface CreateSupplierQuotationInput {
  rfqId: string;
  supplierId: string;
  validUntil?: string | null;
  notes?: string | null;
  customFields?: Record<string, unknown>;
  lines: CreateSupplierQuotationLineInput[];
}

/** Header + wholesale line replacement — only while still 'received'. */
export interface UpdateSupplierQuotationInput {
  validUntil?: string | null;
  notes?: string | null;
  customFields?: Record<string, unknown>;
  lines?: CreateSupplierQuotationLineInput[];
}

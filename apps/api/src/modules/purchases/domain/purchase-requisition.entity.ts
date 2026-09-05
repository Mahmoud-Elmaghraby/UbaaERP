/**
 * Purchase Requisition (master doc §10, step 3 — Purchases, Stage 2). The
 * internal "we need to buy this" request that starts the Purchases cycle,
 * ahead of RFQ/purchase orders.
 */
export type PurchaseRequisitionStatus = 'draft' | 'submitted' | 'approved' | 'rejected' | 'cancelled';

export interface PurchaseRequisitionLine {
  id: string;
  requisitionId: string;
  productVariantId: string;
  quantity: number;
  notes: string | null;
  createdAt: Date;
}

export interface PurchaseRequisition {
  id: string;
  requisitionNumber: string;
  requestedBy: string;
  branchId: string | null;
  status: PurchaseRequisitionStatus;
  neededByDate: string | null;
  notes: string | null;
  customFields: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface PurchaseRequisitionWithLines extends PurchaseRequisition {
  lines: PurchaseRequisitionLine[];
}

export interface CreatePurchaseRequisitionLineInput {
  productVariantId: string;
  quantity: number;
  notes?: string | null;
}

export interface CreatePurchaseRequisitionInput {
  requestedBy: string;
  branchId?: string | null;
  neededByDate?: string | null;
  notes?: string | null;
  customFields?: Record<string, unknown>;
  lines: CreatePurchaseRequisitionLineInput[];
}

/** Header-only fields — lines are replaced wholesale via replaceLines(), not merged field-by-field. */
export interface UpdatePurchaseRequisitionInput {
  branchId?: string | null;
  neededByDate?: string | null;
  notes?: string | null;
  customFields?: Record<string, unknown>;
  lines?: CreatePurchaseRequisitionLineInput[];
}

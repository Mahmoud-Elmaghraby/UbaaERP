/**
 * Delivery (master doc §10, step 4 — Sales, Stage 4). Records physical
 * shipment of goods against a sales order. Confirming one (not creating
 * it — see DeliveriesService.confirm()) is what actually moves stock,
 * via the Event Bus (CLAUDE.md §2.6) — never a direct call into
 * Inventory. Mirror image of Goods Receipt; see migration 0044's
 * comment for the one structural difference (no unit cost on lines).
 */
export type DeliveryStatus = 'draft' | 'confirmed' | 'cancelled';

/** A lot picked for a delivery line (migration 0077). No lots = Inventory picks FEFO, skipping expired lots. */
export interface DeliveryLot {
  lotNumber: string;
  quantity: number;
}

export interface DeliveryLine {
  id: string;
  deliveryId: string;
  salesOrderLineId: string;
  productVariantId: string;
  quantityDelivered: number;
  notes: string | null;
  lots: DeliveryLot[];
  createdAt: Date;
}

export interface Delivery {
  id: string;
  deliveryNumber: string;
  salesOrderId: string;
  warehouseId: string;
  status: DeliveryStatus;
  deliveryDate: string | null;
  notes: string | null;
  customFields: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface DeliveryWithLines extends Delivery {
  lines: DeliveryLine[];
}

/**
 * productVariantId is deliberately not part of this input — it's always
 * derived server-side from salesOrderLineId, so a delivery line can
 * never point at a different product than the sales order line it
 * claims to fulfil. Same precedent as CreateGoodsReceiptLineInput.
 */
export interface CreateDeliveryLineInput {
  salesOrderLineId: string;
  quantityDelivered: number;
  notes?: string | null;
  lots?: DeliveryLot[];
}

export interface CreateDeliveryInput {
  salesOrderId: string;
  warehouseId: string;
  lines: CreateDeliveryLineInput[];
  deliveryDate?: string | null;
  notes?: string | null;
  customFields?: Record<string, unknown>;
}

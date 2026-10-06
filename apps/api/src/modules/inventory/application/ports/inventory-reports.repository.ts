import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';

export interface ItemCardMovementRow {
  id: string;
  createdAt: Date;
  warehouseId: string;
  movementType: string;
  /** Signed: + in, − out. */
  quantity: number;
  unitCost: { amountMinorUnits: string; currency: string } | null;
  referenceType: string | null;
  referenceId: string | null;
  /** The source document's number when it is a known document (receipt, delivery, return, count). */
  referenceNumber: string | null;
  lotNumber: string | null;
  notes: string | null;
}

export interface ValuationRow {
  productVariantId: string;
  productName: string;
  productCode: string;
  sku: string;
  categoryId: string | null;
  warehouseId: string;
  warehouseName: string;
  quantity: number;
  /** Σ quantity × average cost across the warehouse's locations, minor units. */
  valueMinorUnits: string;
  currency: string;
}

export interface LowStockRow {
  productVariantId: string;
  productName: string;
  productCode: string;
  sku: string;
  warehouseId: string;
  warehouseName: string;
  locationId: string;
  quantity: number;
  reorderPoint: number;
}

export interface InventoryReportsRepository {
  /** Signed quantity of every movement before `from` (the card's opening balance). */
  quantityBefore(
    db: Kysely<TenantDatabase>,
    productVariantId: string,
    warehouseId: string | null,
    from: Date,
  ): Promise<number>;
  itemCardMovements(
    db: Kysely<TenantDatabase>,
    productVariantId: string,
    filter: { warehouseId: string | null; from: Date | null; to: Date | null; limit: number },
  ): Promise<ItemCardMovementRow[]>;
  valuation(db: Kysely<TenantDatabase>, warehouseId: string | null): Promise<ValuationRow[]>;
  lowStock(db: Kysely<TenantDatabase>, warehouseId: string | null): Promise<LowStockRow[]>;
}

export const INVENTORY_REPORTS_REPOSITORY = Symbol('INVENTORY_REPORTS_REPOSITORY');

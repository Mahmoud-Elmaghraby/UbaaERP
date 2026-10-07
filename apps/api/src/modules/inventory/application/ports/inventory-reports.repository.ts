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
  partyName: string | null;
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
  /** Stock value across the warehouse's locations, minor units. */
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

export interface LotTraceMovementRow {
  id: string;
  createdAt: Date;
  movementType: string;
  /** Signed: + in, − out — only the part of the movement that touched this lot. */
  quantity: number;
  warehouseId: string;
  locationId: string;
  referenceType: string | null;
  referenceId: string | null;
  referenceNumber: string | null;
  partyName: string | null;
}

export interface LotTraceRow {
  stockLotId: string;
  lotNumber: string;
  expiryDate: Date | null;
  productVariantId: string;
  productName: string;
  productCode: string;
  sku: string;
  quantityOnHand: number;
  movements: LotTraceMovementRow[];
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
  valuation(db: Kysely<TenantDatabase>, warehouseId: string | null, asOf: Date | null): Promise<ValuationRow[]>;
  /** Value of goods dispatched by a transfer and not yet received at `asOf` (default now). */
  inTransitValue(db: Kysely<TenantDatabase>, asOf: Date | null): Promise<string>;
  /** Accounting's inventory account balance up to the date, or null when unmapped. */
  ledgerInventoryBalance(db: Kysely<TenantDatabase>, asOfDate: string | null): Promise<string | null>;
  lowStock(db: Kysely<TenantDatabase>, warehouseId: string | null): Promise<LowStockRow[]>;
  /** Every lot whose number matches (case-insensitive, exact), with its movement history. */
  lotTrace(db: Kysely<TenantDatabase>, lotNumber: string): Promise<LotTraceRow[]>;
}

export const INVENTORY_REPORTS_REPOSITORY = Symbol('INVENTORY_REPORTS_REPOSITORY');

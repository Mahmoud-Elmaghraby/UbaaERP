import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import type { StockLevel } from '../../domain/stock-level.entity';
import type { Money } from '@erp-platform/shared-kernel';

export interface StockLevelRepository {
  list(
    db: Kysely<TenantDatabase>,
    filter?: { warehouseId?: string; locationId?: string; productVariantId?: string },
  ): Promise<StockLevel[]>;
  findByVariantAndLocation(
    db: Kysely<TenantDatabase>,
    productVariantId: string,
    locationId: string,
  ): Promise<StockLevel | null>;
  /**
   * Creates the (variant, location) row on first use, or updates
   * quantity/average cost on an existing one — always inside the same
   * transaction as the stock_movements insert that caused the change
   * (StockMovementsService owns that transaction boundary). warehouseId
   * is denormalized from the location, for warehouse-level rollup queries.
   */
  upsert(
    db: Kysely<TenantDatabase>,
    input: {
      productVariantId: string;
      locationId: string;
      warehouseId: string;
      quantityOnHand: number;
      averageCost: Money;
    },
  ): Promise<StockLevel>;
  setReorderPoint(db: Kysely<TenantDatabase>, id: string, reorderPoint: number | null): Promise<StockLevel | null>;
}

export const STOCK_LEVEL_REPOSITORY = Symbol('STOCK_LEVEL_REPOSITORY');

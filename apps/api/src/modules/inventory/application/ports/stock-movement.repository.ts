import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import type { StockMovement } from '../../domain/stock-movement.entity';
import type { Money } from '@erp-platform/shared-kernel';

export interface CreateStockMovementRow {
  productVariantId: string;
  locationId: string;
  warehouseId: string;
  movementType: StockMovement['movementType'];
  quantity: number;
  unitCost: Money | null;
  resultingAverageCost: Money;
  referenceType?: string | null;
  referenceId?: string | null;
  relatedMovementId?: string | null;
  stockLotId?: string | null;
  notes?: string | null;
  createdBy?: string | null;
}

export interface StockMovementRepository {
  list(
    db: Kysely<TenantDatabase>,
    filter?: { productVariantId?: string; warehouseId?: string; locationId?: string; limit?: number },
  ): Promise<StockMovement[]>;
  findById(db: Kysely<TenantDatabase>, id: string): Promise<StockMovement | null>;
  /** Inserted inside the same transaction as the StockLevelRepository.upsert() it accompanies. */
  create(db: Kysely<TenantDatabase>, input: CreateStockMovementRow): Promise<StockMovement>;
  /** Sets related_movement_id after both legs of a transfer exist (they reference each other). */
  /** True when any movement already carries this (reference_type, reference_id) — the document was already applied. */
  existsForReference(db: Kysely<TenantDatabase>, referenceType: string, referenceId: string): Promise<boolean>;
  linkRelatedMovement(db: Kysely<TenantDatabase>, id: string, relatedMovementId: string): Promise<void>;
}

export const STOCK_MOVEMENT_REPOSITORY = Symbol('STOCK_MOVEMENT_REPOSITORY');

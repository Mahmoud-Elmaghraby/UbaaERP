import type { Kysely } from 'kysely';
import type { Money } from '@erp-platform/shared-kernel';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import type { LandedCost, LandedCostAllocation, LandedCostAllocationMethod } from '../../domain/landed-cost.entity';

export interface CreateLandedCostHeaderInput {
  totalCost: Money;
  allocationMethod: LandedCostAllocationMethod;
  referenceType?: string | null;
  referenceId?: string | null;
  notes?: string | null;
  createdBy?: string | null;
}

export interface CreateLandedCostAllocationInput {
  landedCostId: string;
  stockMovementId: string;
  productVariantId: string;
  locationId: string;
  warehouseId: string;
  allocatedAmount: Money;
  expensedAmount: Money;
  resultingAverageCost: Money;
}

export interface LandedCostRepository {
  list(db: Kysely<TenantDatabase>): Promise<LandedCost[]>;
  findById(db: Kysely<TenantDatabase>, id: string): Promise<LandedCost | null>;
  /** Creates the header row only — allocations are added one at a time via createAllocation(), in the same transaction. */
  createHeader(db: Kysely<TenantDatabase>, input: CreateLandedCostHeaderInput): Promise<LandedCost>;
  createAllocation(db: Kysely<TenantDatabase>, input: CreateLandedCostAllocationInput): Promise<LandedCostAllocation>;
}

export const LANDED_COST_REPOSITORY = Symbol('LANDED_COST_REPOSITORY');

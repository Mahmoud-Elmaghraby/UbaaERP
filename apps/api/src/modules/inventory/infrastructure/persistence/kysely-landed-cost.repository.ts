import { randomUUID } from 'node:crypto';
import type { Kysely, Selectable } from 'kysely';
import { Money } from '@erp-platform/shared-kernel';
import type {
  LandedCostsTable,
  LandedCostAllocationsTable,
  TenantDatabase,
} from '../../../../database/tenant/kysely-client';
import type {
  LandedCostRepository,
  CreateLandedCostHeaderInput,
  CreateLandedCostAllocationInput,
} from '../../application/ports/landed-cost.repository';
import type { LandedCost, LandedCostAllocation, LandedCostAllocationMethod } from '../../domain/landed-cost.entity';

function headerToDomain(row: Selectable<LandedCostsTable>, allocations: LandedCostAllocation[]): LandedCost {
  return {
    id: row.id,
    totalCost: Money.fromMinorUnits(BigInt(row.total_cost_amount), row.total_cost_currency),
    allocationMethod: row.allocation_method as LandedCostAllocationMethod,
    referenceType: row.reference_type,
    referenceId: row.reference_id,
    notes: row.notes,
    createdBy: row.created_by,
    createdAt: row.created_at,
    allocations,
  };
}

function allocationToDomain(row: Selectable<LandedCostAllocationsTable>): LandedCostAllocation {
  return {
    id: row.id,
    landedCostId: row.landed_cost_id,
    stockMovementId: row.stock_movement_id,
    productVariantId: row.product_variant_id,
    locationId: row.location_id,
    warehouseId: row.warehouse_id,
    allocatedAmount: Money.fromMinorUnits(BigInt(row.allocated_amount_amount), row.allocated_amount_currency),
    resultingAverageCost: Money.fromMinorUnits(
      BigInt(row.resulting_average_cost_amount),
      row.resulting_average_cost_currency,
    ),
    createdAt: row.created_at,
  };
}

export class KyselyLandedCostRepository implements LandedCostRepository {
  async list(db: Kysely<TenantDatabase>): Promise<LandedCost[]> {
    const headers = await db.selectFrom('landed_costs').selectAll().orderBy('created_at', 'desc').execute();
    if (headers.length === 0) return [];

    const allocationRows = await db
      .selectFrom('landed_cost_allocations')
      .selectAll()
      .where(
        'landed_cost_id',
        'in',
        headers.map((h) => h.id),
      )
      .execute();
    const allocationsByHeaderId = new Map<string, LandedCostAllocation[]>();
    for (const row of allocationRows) {
      const allocation = allocationToDomain(row);
      const list = allocationsByHeaderId.get(allocation.landedCostId) ?? [];
      list.push(allocation);
      allocationsByHeaderId.set(allocation.landedCostId, list);
    }

    return headers.map((row) => headerToDomain(row, allocationsByHeaderId.get(row.id) ?? []));
  }

  async findById(db: Kysely<TenantDatabase>, id: string): Promise<LandedCost | null> {
    const row = await db.selectFrom('landed_costs').selectAll().where('id', '=', id).executeTakeFirst();
    if (!row) return null;

    const allocationRows = await db
      .selectFrom('landed_cost_allocations')
      .selectAll()
      .where('landed_cost_id', '=', id)
      .execute();

    return headerToDomain(row, allocationRows.map(allocationToDomain));
  }

  async createHeader(db: Kysely<TenantDatabase>, input: CreateLandedCostHeaderInput): Promise<LandedCost> {
    const row = await db
      .insertInto('landed_costs')
      .values({
        id: randomUUID(),
        total_cost_amount: input.totalCost.toMinorUnits().toString(),
        total_cost_currency: input.totalCost.currency,
        allocation_method: input.allocationMethod,
        reference_type: input.referenceType ?? null,
        reference_id: input.referenceId ?? null,
        notes: input.notes ?? null,
        created_by: input.createdBy ?? null,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return headerToDomain(row, []);
  }

  async createAllocation(
    db: Kysely<TenantDatabase>,
    input: CreateLandedCostAllocationInput,
  ): Promise<LandedCostAllocation> {
    const row = await db
      .insertInto('landed_cost_allocations')
      .values({
        id: randomUUID(),
        landed_cost_id: input.landedCostId,
        stock_movement_id: input.stockMovementId,
        product_variant_id: input.productVariantId,
        location_id: input.locationId,
        warehouse_id: input.warehouseId,
        allocated_amount_amount: input.allocatedAmount.toMinorUnits().toString(),
        allocated_amount_currency: input.allocatedAmount.currency,
        resulting_average_cost_amount: input.resultingAverageCost.toMinorUnits().toString(),
        resulting_average_cost_currency: input.resultingAverageCost.currency,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return allocationToDomain(row);
  }
}

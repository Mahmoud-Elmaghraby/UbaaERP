import { Inject, Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import { Money } from '@erp-platform/shared-kernel';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import { LANDED_COST_REPOSITORY, type LandedCostRepository } from '../ports/landed-cost.repository';
import { STOCK_MOVEMENT_REPOSITORY, type StockMovementRepository } from '../ports/stock-movement.repository';
import { STOCK_LEVEL_REPOSITORY, type StockLevelRepository } from '../ports/stock-level.repository';
import type { StockMovement } from '../../domain/stock-movement.entity';
import type {
  LandedCost,
  LandedCostAllocation,
  LandedCostAllocationMethod,
  ApplyLandedCostInput,
} from '../../domain/landed-cost.entity';
import { BusinessRuleError, NotFoundError } from '../errors';

/**
 * Landed Cost (master doc §17 competitor research; approved 2026-08-28).
 * Spreads an extra cost (freight, customs, insurance — arriving after the
 * fact) across a set of prior incoming ('in') stock movements, raising the
 * CURRENT weighted-average cost of whatever quantity from each movement is
 * still on hand. Deliberately does not touch stock_movements (a landed
 * cost changes valuation, not quantity — quantity has a DB CHECK > 0) or
 * already-consumed stock (there is no COGS/Accounting integration yet to
 * post a valuation adjustment against stock that has already left).
 */
@Injectable()
export class LandedCostsService {
  constructor(
    @Inject(LANDED_COST_REPOSITORY) private readonly landedCosts: LandedCostRepository,
    @Inject(STOCK_MOVEMENT_REPOSITORY) private readonly movements: StockMovementRepository,
    @Inject(STOCK_LEVEL_REPOSITORY) private readonly stockLevels: StockLevelRepository,
  ) {}

  list(db: Kysely<TenantDatabase>): Promise<LandedCost[]> {
    return this.landedCosts.list(db);
  }

  async getById(db: Kysely<TenantDatabase>, id: string): Promise<LandedCost> {
    const landedCost = await this.landedCosts.findById(db, id);
    if (!landedCost) throw new NotFoundError(`Landed cost "${id}" not found.`);
    return landedCost;
  }

  async apply(db: Kysely<TenantDatabase>, input: ApplyLandedCostInput): Promise<LandedCost> {
    if (!input.totalCost.isPositive()) {
      throw new BusinessRuleError('Landed cost total must be a positive amount.');
    }
    if (input.stockMovementIds.length === 0) {
      throw new BusinessRuleError('At least one stock movement must be selected for landed cost allocation.');
    }
    if (new Set(input.stockMovementIds).size !== input.stockMovementIds.length) {
      throw new BusinessRuleError('Duplicate stock movement ids are not allowed in a single landed cost allocation.');
    }

    return db.transaction().execute(async (trx) => {
      const movements = await Promise.all(
        input.stockMovementIds.map((id) => this.fetchEligibleMovement(trx, id)),
      );

      const weights = this.computeWeights(movements, input.allocationMethod);
      const amounts = this.splitAmount(input.totalCost, weights);

      const header = await this.landedCosts.createHeader(trx, {
        totalCost: input.totalCost,
        allocationMethod: input.allocationMethod,
        referenceType: input.referenceType,
        referenceId: input.referenceId,
        notes: input.notes,
        createdBy: input.createdBy,
      });

      const allocations: LandedCostAllocation[] = [];
      for (let i = 0; i < movements.length; i += 1) {
        const movement = movements[i];
        const allocatedAmount = amounts[i];

        const current = await this.stockLevels.findByVariantAndLocation(
          trx,
          movement.productVariantId,
          movement.locationId,
        );
        if (!current || current.quantityOnHand <= 0) {
          throw new BusinessRuleError(
            `Cannot apply a landed cost to movement "${movement.id}": no stock is currently on hand at this ` +
              'location (it has already been fully consumed, so there is nothing left to revalue).',
          );
        }

        const newAverageCost = current.averageCost
          .multiplyByQuantity(current.quantityOnHand)
          .add(allocatedAmount)
          .divideByQuantity(current.quantityOnHand);

        await this.stockLevels.upsert(trx, {
          productVariantId: movement.productVariantId,
          locationId: movement.locationId,
          warehouseId: movement.warehouseId,
          quantityOnHand: current.quantityOnHand,
          averageCost: newAverageCost,
        });

        const allocation = await this.landedCosts.createAllocation(trx, {
          landedCostId: header.id,
          stockMovementId: movement.id,
          productVariantId: movement.productVariantId,
          locationId: movement.locationId,
          warehouseId: movement.warehouseId,
          allocatedAmount,
          resultingAverageCost: newAverageCost,
        });
        allocations.push(allocation);
      }

      return { ...header, allocations };
    });
  }

  private async fetchEligibleMovement(trx: Kysely<TenantDatabase>, id: string): Promise<StockMovement> {
    const movement = await this.movements.findById(trx, id);
    if (!movement) throw new NotFoundError(`Stock movement "${id}" not found.`);
    if (movement.movementType !== 'in') {
      throw new BusinessRuleError(
        `Landed cost can only be applied to incoming ("in") stock movements; movement "${id}" is "${movement.movementType}".`,
      );
    }
    if (!movement.unitCost) {
      throw new BusinessRuleError(`Stock movement "${id}" has no recorded unit cost to weight the allocation by.`);
    }
    return movement;
  }

  private computeWeights(movements: StockMovement[], method: LandedCostAllocationMethod): number[] {
    return movements.map((movement) => {
      if (method === 'by_quantity') return movement.quantity;
      // by_value: quantity × unit cost (minor units) — proportion only, so float precision here is fine.
      return movement.quantity * Number((movement.unitCost as Money).toMinorUnits());
    });
  }

  /** Proportionally splits `totalCost` by `weights`, with the last share absorbing the rounding remainder so the parts always sum exactly to the whole. */
  private splitAmount(totalCost: Money, weights: number[]): Money[] {
    const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
    if (totalWeight <= 0) {
      throw new BusinessRuleError(
        'Cannot allocate a landed cost across movements whose combined quantity/value is zero.',
      );
    }

    const totalMinorUnits = totalCost.toMinorUnits();
    const shares: bigint[] = [];
    let allocated = 0n;
    for (let i = 0; i < weights.length; i += 1) {
      if (i === weights.length - 1) {
        shares.push(totalMinorUnits - allocated);
      } else {
        const share = BigInt(Math.round((Number(totalMinorUnits) * weights[i]) / totalWeight));
        shares.push(share);
        allocated += share;
      }
    }

    if (shares.some((share) => share <= 0n)) {
      throw new BusinessRuleError(
        'The landed cost total is too small to split across all selected movements — each line must receive a positive amount.',
      );
    }

    return shares.map((minorUnits) => Money.fromMinorUnits(minorUnits, totalCost.currency));
  }
}

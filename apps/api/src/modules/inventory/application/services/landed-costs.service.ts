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
import { BusinessRuleError } from '../errors';
import { entityNotFound } from '../../../../shared/errors/entity-errors';
import { withTransaction } from '../../../../database/tenant/transaction.util';
import { OutboxWriterService } from '../../../../shared/outbox/application/services/outbox-writer.service';
import { moneyToDto } from '../../presentation/money.mapper';

/**
 * Landed Cost (master doc §17 competitor research; approved 2026-08-28).
 * Spreads an extra cost (freight, customs, insurance — arriving after the
 * fact) across a set of prior incoming ('in') stock movements. Each
 * movement's share is split by how much of the received goods is still on
 * hand at that location: that part raises the stock value (and so the
 * average cost), the part for goods already sold is expensed to cost of
 * goods sold (inventory completion, item 3 — it used to be refused once
 * any stock had left, or loaded entirely onto the few units left, which
 * overstated them). Quantities never change (a landed cost is valuation
 * only). The outcome goes to Accounting via the outbox
 * ('inventory.landed_cost.posted').
 */
@Injectable()
export class LandedCostsService {
  constructor(
    @Inject(LANDED_COST_REPOSITORY) private readonly landedCosts: LandedCostRepository,
    @Inject(STOCK_MOVEMENT_REPOSITORY) private readonly movements: StockMovementRepository,
    @Inject(STOCK_LEVEL_REPOSITORY) private readonly stockLevels: StockLevelRepository,
    private readonly outboxWriter: OutboxWriterService,
  ) {}

  list(db: Kysely<TenantDatabase>): Promise<LandedCost[]> {
    return this.landedCosts.list(db);
  }

  async getById(db: Kysely<TenantDatabase>, id: string): Promise<LandedCost> {
    const landedCost = await this.landedCosts.findById(db, id);
    if (!landedCost) throw entityNotFound('LANDED_COST', id);
    return landedCost;
  }

  async apply(
    db: Kysely<TenantDatabase>,
    input: ApplyLandedCostInput,
    context?: { schema: string; actorUserId?: string },
  ): Promise<LandedCost> {
    if (!input.totalCost.isPositive()) {
      throw new BusinessRuleError('Landed cost total must be a positive amount.', {
        code: 'LANDED_COST.TOTAL_MUST_BE_POSITIVE',
      });
    }
    if (input.stockMovementIds.length === 0) {
      throw new BusinessRuleError('At least one stock movement must be selected for landed cost allocation.', {
        code: 'LANDED_COST.AT_LEAST_ONE_MOVEMENT_REQUIRED',
      });
    }
    if (new Set(input.stockMovementIds).size !== input.stockMovementIds.length) {
      throw new BusinessRuleError('Duplicate stock movement ids are not allowed in a single landed cost allocation.', {
        code: 'LANDED_COST.DUPLICATE_MOVEMENT_IDS',
      });
    }

    // withTransaction: joins the caller's transaction when there is one.
    return withTransaction(db, async (trx) => {
      const movements = await Promise.all(
        input.stockMovementIds.map((id) => this.fetchEligibleMovement(trx, id)),
      );
      // Revaluing reads and rewrites stock_levels — serialize with every
      // concurrent stock movement on the same variants (see lockVariants).
      await this.stockLevels.lockVariants(
        trx,
        movements.map((movement) => movement.productVariantId),
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

      // How much of the selected receipts is still in stock, per (variant,
      // location): the receipts' combined quantity vs what is on hand now.
      const receivedByKey = new Map<string, number>();
      for (const movement of movements) {
        const key = `${movement.productVariantId}|${movement.locationId}`;
        receivedByKey.set(key, (receivedByKey.get(key) ?? 0) + movement.quantity);
      }

      const currency = input.totalCost.currency;
      let toInventory = Money.zero(currency);
      let toCogs = Money.zero(currency);
      const allocations: LandedCostAllocation[] = [];
      for (let i = 0; i < movements.length; i += 1) {
        const movement = movements[i];
        const allocatedAmount = amounts[i];

        const current = await this.stockLevels.findByVariantAndLocation(
          trx,
          movement.productVariantId,
          movement.locationId,
        );
        const onHand = current ? Math.max(current.quantityOnHand, 0) : 0;
        const received = receivedByKey.get(`${movement.productVariantId}|${movement.locationId}`) ?? movement.quantity;
        // The share of the goods still on hand takes the cost into the stock
        // value; the rest was already sold, so its share is cost of goods sold.
        const inStock =
          onHand >= received ? allocatedAmount : moneyShare(allocatedAmount, Math.min(onHand, received), received);
        const expensed = allocatedAmount.subtract(inStock);

        let resultingAverageCost = current?.averageCost ?? Money.zero(currency);
        if (current && onHand > 0 && inStock.isPositive()) {
          if (current.inventoryValue.currency !== currency) {
            throw new BusinessRuleError(
              `Landed cost currency ${currency} differs from the stock valuation currency ` +
                `${current.inventoryValue.currency}.`,
              { code: 'LANDED_COST.CURRENCY_MISMATCH', params: { currency: current.inventoryValue.currency } },
            );
          }
          const inventoryValue = current.inventoryValue.add(inStock);
          resultingAverageCost = inventoryValue.divideByQuantity(current.quantityOnHand);
          await this.stockLevels.upsert(trx, {
            productVariantId: movement.productVariantId,
            locationId: movement.locationId,
            warehouseId: movement.warehouseId,
            quantityOnHand: current.quantityOnHand,
            averageCost: resultingAverageCost,
            inventoryValue,
          });
        }
        toInventory = toInventory.add(inStock);
        toCogs = toCogs.add(expensed);

        const allocation = await this.landedCosts.createAllocation(trx, {
          landedCostId: header.id,
          stockMovementId: movement.id,
          productVariantId: movement.productVariantId,
          locationId: movement.locationId,
          warehouseId: movement.warehouseId,
          allocatedAmount,
          expensedAmount: expensed,
          resultingAverageCost,
        });
        allocations.push(allocation);
      }

      if (context) {
        // Same transaction as the revaluation: Accounting posts the extra
        // cost (debit stock / cost of goods sold) and never misses it.
        await this.outboxWriter.write(trx, 'inventory.landed_cost.posted', {
          schema: context.schema,
          entityType: 'landed_cost',
          entityId: header.id,
          action: 'posted',
          actorUserId: context.actorUserId ?? null,
          metadata: {
            referenceType: input.referenceType ?? null,
            referenceId: input.referenceId ?? null,
            currency,
            totalCost: moneyToDto(input.totalCost),
            toInventory: moneyToDto(toInventory),
            toCogs: moneyToDto(toCogs),
          },
          occurredAt: new Date(),
        });
      }

      return { ...header, allocations };
    });
  }

  private async fetchEligibleMovement(trx: Kysely<TenantDatabase>, id: string): Promise<StockMovement> {
    const movement = await this.movements.findById(trx, id);
    if (!movement) throw entityNotFound('STOCK_MOVEMENT', id);
    if (movement.movementType !== 'in') {
      throw new BusinessRuleError(
        `Landed cost can only be applied to incoming ("in") stock movements; movement "${id}" is "${movement.movementType}".`,
        { code: 'LANDED_COST.MOVEMENT_NOT_INCOMING', params: { id, movementType: movement.movementType } },
      );
    }
    if (!movement.unitCost) {
      throw new BusinessRuleError(
        `Stock movement "${id}" has no recorded unit cost to weight the allocation by.`,
        { code: 'LANDED_COST.MOVEMENT_MISSING_UNIT_COST', params: { id } },
      );
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
        { code: 'LANDED_COST.ZERO_TOTAL_WEIGHT' },
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
        { code: 'LANDED_COST.TOTAL_TOO_SMALL_TO_SPLIT' },
      );
    }

    return shares.map((minorUnits) => Money.fromMinorUnits(minorUnits, totalCost.currency));
  }
}

/** value × part / whole in minor units, rounded half-up (part ≤ whole). */
function moneyShare(value: Money, part: number, whole: number): Money {
  const partScaled = BigInt(Math.round(part * 10_000));
  const wholeScaled = BigInt(Math.round(whole * 10_000));
  if (wholeScaled === 0n) return Money.zero(value.currency);
  const rounded = (value.toMinorUnits() * partScaled * 2n + wholeScaled) / (wholeScaled * 2n);
  return Money.fromMinorUnits(rounded, value.currency);
}

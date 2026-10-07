import type { Kysely } from 'kysely';
import { Money } from '@erp-platform/shared-kernel';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import type { LandedCostRepository } from '../ports/landed-cost.repository';
import type { StockMovementRepository } from '../ports/stock-movement.repository';
import type { StockLevelRepository } from '../ports/stock-level.repository';
import type { StockMovement } from '../../domain/stock-movement.entity';
import type { StockLevel } from '../../domain/stock-level.entity';
import type { LandedCost, LandedCostAllocation } from '../../domain/landed-cost.entity';
import { BusinessRuleError, NotFoundError } from '../errors';
import type { OutboxWriterService } from '../../../../shared/outbox/application/services/outbox-writer.service';
import { LandedCostsService } from './landed-costs.service';

const FAKE_TRX = { __trx: true } as unknown as Kysely<TenantDatabase>;
const FAKE_DB = {
  transaction: () => ({
    execute: (cb: (trx: Kysely<TenantDatabase>) => unknown) => cb(FAKE_TRX),
  }),
} as unknown as Kysely<TenantDatabase>;

let movementCounter = 0;
function makeMovement(overrides: Partial<StockMovement> = {}): StockMovement {
  movementCounter += 1;
  return {
    id: `movement-${movementCounter}`,
    productVariantId: 'variant-1',
    locationId: 'loc-1',
    warehouseId: 'wh-1',
    movementType: 'in',
    quantity: 10,
    unitCost: Money.fromMinorUnits(1000, 'EGP'),
    resultingAverageCost: Money.fromMinorUnits(1000, 'EGP'),
    totalCost: null,
    referenceType: null,
    referenceId: null,
    relatedMovementId: null,
    stockLotId: null,
    notes: null,
    createdBy: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

function makeStockLevel(overrides: Partial<StockLevel> = {}): StockLevel {
  const level = {
    id: 'level-1',
    productVariantId: 'variant-1',
    locationId: 'loc-1',
    warehouseId: 'wh-1',
    quantityOnHand: 10,
    reorderPoint: null,
    averageCost: Money.fromMinorUnits(1000, 'EGP'),
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
  // The stock value follows quantity × average unless a test sets it.
  return {
    ...level,
    inventoryValue: overrides.inventoryValue ?? level.averageCost.multiplyByQuantity(Math.max(level.quantityOnHand, 0)),
  };
}

function makeHeader(overrides: Partial<LandedCost> = {}): LandedCost {
  return {
    id: 'landed-cost-1',
    totalCost: Money.fromMinorUnits(10000, 'EGP'),
    allocationMethod: 'by_quantity',
    referenceType: null,
    referenceId: null,
    notes: null,
    createdBy: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    allocations: [],
    ...overrides,
  };
}

function makeMockLandedCostRepository(): jest.Mocked<LandedCostRepository> {
  return {
    list: jest.fn(),
    findById: jest.fn(),
    createHeader: jest.fn(),
    createAllocation: jest.fn(),
  };
}

function makeMockMovementRepository(): jest.Mocked<StockMovementRepository> {
  return {
    list: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    linkRelatedMovement: jest.fn(),
    existsForReference: jest.fn().mockResolvedValue(false),
    sumForReference: jest.fn().mockResolvedValue(null),
  };
}

function makeMockStockLevelRepository(): jest.Mocked<StockLevelRepository> {
  return {
    list: jest.fn(),
    findByVariantAndLocation: jest.fn(),
    upsert: jest.fn(),
    setReorderPoint: jest.fn(),
    lockVariants: jest.fn().mockResolvedValue(undefined),
  };
}

describe('LandedCostsService', () => {
  let landedCosts: jest.Mocked<LandedCostRepository>;
  let movements: jest.Mocked<StockMovementRepository>;
  let stockLevels: jest.Mocked<StockLevelRepository>;
  let service: LandedCostsService;
  let outboxWriter: { write: jest.Mock };

  beforeEach(() => {
    movementCounter = 0;
    landedCosts = makeMockLandedCostRepository();
    movements = makeMockMovementRepository();
    stockLevels = makeMockStockLevelRepository();
    outboxWriter = { write: jest.fn().mockResolvedValue(undefined) };
    service = new LandedCostsService(
      landedCosts,
      movements,
      stockLevels,
      outboxWriter as unknown as OutboxWriterService,
    );

    landedCosts.createHeader.mockImplementation(async (_db, input) => makeHeader({ ...input }));
    landedCosts.createAllocation.mockImplementation(async (_db, input) => ({ ...input, id: 'alloc', createdAt: new Date() }) as LandedCostAllocation);
  });

  describe('apply()', () => {
    it('rejects a non-positive total cost', async () => {
      await expect(
        service.apply(FAKE_DB, {
          totalCost: Money.zero('EGP'),
          allocationMethod: 'by_quantity',
          stockMovementIds: ['movement-1'],
        }),
      ).rejects.toThrow(BusinessRuleError);
    });

    it('rejects an empty movement list', async () => {
      await expect(
        service.apply(FAKE_DB, {
          totalCost: Money.fromMinorUnits(1000, 'EGP'),
          allocationMethod: 'by_quantity',
          stockMovementIds: [],
        }),
      ).rejects.toThrow(BusinessRuleError);
    });

    it('rejects duplicate movement ids', async () => {
      await expect(
        service.apply(FAKE_DB, {
          totalCost: Money.fromMinorUnits(1000, 'EGP'),
          allocationMethod: 'by_quantity',
          stockMovementIds: ['movement-1', 'movement-1'],
        }),
      ).rejects.toThrow(BusinessRuleError);
    });

    it('throws NotFoundError when a referenced stock movement does not exist', async () => {
      movements.findById.mockResolvedValue(null);

      await expect(
        service.apply(FAKE_DB, {
          totalCost: Money.fromMinorUnits(1000, 'EGP'),
          allocationMethod: 'by_quantity',
          stockMovementIds: ['missing-movement'],
        }),
      ).rejects.toThrow(NotFoundError);
    });

    it('rejects a movement that is not an incoming ("in") movement', async () => {
      movements.findById.mockResolvedValue(makeMovement({ movementType: 'out' }));

      await expect(
        service.apply(FAKE_DB, {
          totalCost: Money.fromMinorUnits(1000, 'EGP'),
          allocationMethod: 'by_quantity',
          stockMovementIds: ['movement-1'],
        }),
      ).rejects.toThrow(BusinessRuleError);
    });

    it('expenses the whole amount when the received goods were all sold', async () => {
      movements.findById.mockResolvedValue(makeMovement());
      stockLevels.findByVariantAndLocation.mockResolvedValue(null);

      const result = await service.apply(
        FAKE_DB,
        {
          totalCost: Money.fromMinorUnits(1000, 'EGP'),
          allocationMethod: 'by_quantity',
          stockMovementIds: ['movement-1'],
        },
        { schema: 'tenant_x' },
      );

      expect(stockLevels.upsert).not.toHaveBeenCalled();
      expect(result.allocations[0].expensedAmount.toMinorUnits()).toBe(1000n);
      const event = outboxWriter.write.mock.calls[0];
      expect(event[1]).toBe('inventory.landed_cost.posted');
      expect(event[2].metadata).toMatchObject({
        toInventory: { amountMinorUnits: '0' },
        toCogs: { amountMinorUnits: '1000' },
      });
    });

    it('loads only the on-hand share into stock and expenses the sold share', async () => {
      // Received 10, 4 left: 40% of 500 stays in stock, 60% was sold.
      movements.findById.mockResolvedValue(makeMovement({ id: 'movement-1', quantity: 10 }));
      stockLevels.findByVariantAndLocation.mockResolvedValue(
        makeStockLevel({ quantityOnHand: 4, averageCost: Money.fromMinorUnits(1000, 'EGP') }),
      );

      const result = await service.apply(FAKE_DB, {
        totalCost: Money.fromMinorUnits(500, 'EGP'),
        allocationMethod: 'by_quantity',
        stockMovementIds: ['movement-1'],
      });

      const upsertArg = stockLevels.upsert.mock.calls[0][1];
      expect(upsertArg.inventoryValue.toMinorUnits()).toBe(4200n); // 4 × 10.00 + 2.00
      expect(upsertArg.averageCost.toMinorUnits()).toBe(1050n);
      expect(result.allocations[0].expensedAmount.toMinorUnits()).toBe(300n);
      expect(outboxWriter.write).not.toHaveBeenCalled(); // no context → no event
    });

    it('allocates the full amount to a single movement and raises its average cost', async () => {
      const movement = makeMovement({ id: 'movement-1', quantity: 10 });
      movements.findById.mockResolvedValue(movement);
      stockLevels.findByVariantAndLocation.mockResolvedValue(
        makeStockLevel({ quantityOnHand: 10, averageCost: Money.fromMinorUnits(1000, 'EGP') }),
      );

      const result = await service.apply(FAKE_DB, {
        totalCost: Money.fromMinorUnits(500, 'EGP'), // 5.00 total freight for 10 units -> +0.50/unit
        allocationMethod: 'by_quantity',
        stockMovementIds: ['movement-1'],
      });

      const upsertArg = stockLevels.upsert.mock.calls[0][1];
      expect(upsertArg.averageCost.toMinorUnits()).toBe(1050n); // 10.00 + 0.50
      expect(upsertArg.quantityOnHand).toBe(10); // unchanged
      expect(result.allocations).toHaveLength(1);
      expect(result.allocations[0].allocatedAmount.toMinorUnits()).toBe(500n);
    });

    it('splits proportionally by quantity across multiple movements, remainder to the last', async () => {
      const movementA = makeMovement({ id: 'movement-a', quantity: 10, locationId: 'loc-a' });
      const movementB = makeMovement({ id: 'movement-b', quantity: 20, locationId: 'loc-b' });
      movements.findById.mockImplementation(async (_db, id) => (id === 'movement-a' ? movementA : movementB));
      stockLevels.findByVariantAndLocation.mockImplementation(async (_db, _variantId, locationId) =>
        makeStockLevel({
          locationId,
          quantityOnHand: locationId === 'loc-a' ? 10 : 20,
          averageCost: Money.fromMinorUnits(1000, 'EGP'),
        }),
      );

      const result = await service.apply(FAKE_DB, {
        totalCost: Money.fromMinorUnits(300, 'EGP'), // split 1/3 : 2/3 by quantity (10 : 20)
        allocationMethod: 'by_quantity',
        stockMovementIds: ['movement-a', 'movement-b'],
      });

      expect(result.allocations).toHaveLength(2);
      const total = result.allocations.reduce((sum, a) => sum + a.allocatedAmount.toMinorUnits(), 0n);
      expect(total).toBe(300n); // exact split, no rounding loss
      expect(result.allocations[0].allocatedAmount.toMinorUnits()).toBe(100n); // 1/3 of 300
      expect(result.allocations[1].allocatedAmount.toMinorUnits()).toBe(200n); // remainder
    });

    it('splits by value (quantity × unit cost) rather than raw quantity when allocationMethod is by_value', async () => {
      // A: 10 units @ 10.00 = value 100.00; B: 5 units @ 40.00 = value 200.00 -> split 1:2
      const movementA = makeMovement({
        id: 'movement-a',
        quantity: 10,
        unitCost: Money.fromMinorUnits(1000, 'EGP'),
        locationId: 'loc-a',
      });
      const movementB = makeMovement({
        id: 'movement-b',
        quantity: 5,
        unitCost: Money.fromMinorUnits(4000, 'EGP'),
        locationId: 'loc-b',
      });
      movements.findById.mockImplementation(async (_db, id) => (id === 'movement-a' ? movementA : movementB));
      stockLevels.findByVariantAndLocation.mockImplementation(async (_db, _variantId, locationId) =>
        makeStockLevel({
          locationId,
          quantityOnHand: locationId === 'loc-a' ? 10 : 5,
          averageCost: Money.fromMinorUnits(1000, 'EGP'),
        }),
      );

      const result = await service.apply(FAKE_DB, {
        totalCost: Money.fromMinorUnits(300, 'EGP'),
        allocationMethod: 'by_value',
        stockMovementIds: ['movement-a', 'movement-b'],
      });

      expect(result.allocations[0].allocatedAmount.toMinorUnits()).toBe(100n); // 1/3
      expect(result.allocations[1].allocatedAmount.toMinorUnits()).toBe(200n); // 2/3
    });
  });
});

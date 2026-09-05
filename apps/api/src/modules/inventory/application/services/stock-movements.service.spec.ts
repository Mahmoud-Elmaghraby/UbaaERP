import type { Kysely } from 'kysely';
import { Money } from '@erp-platform/shared-kernel';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import type { StockLevelRepository } from '../ports/stock-level.repository';
import type { StockMovementRepository } from '../ports/stock-movement.repository';
import type { WarehouseLocationRepository } from '../ports/warehouse-location.repository';
import type { ProductRepository } from '../ports/product.repository';
import type { ProductVariantRepository } from '../ports/product-variant.repository';
import type { StockLotRepository } from '../ports/stock-lot.repository';
import type { StockLevel } from '../../domain/stock-level.entity';
import type { StockMovement } from '../../domain/stock-movement.entity';
import type { WarehouseLocation } from '../../domain/warehouse-location.entity';
import type { Product } from '../../domain/product.entity';
import type { ProductVariant } from '../../domain/product-variant.entity';
import { BusinessRuleError, NotFoundError } from '../errors';
import { StockMovementsService } from './stock-movements.service';
import { UnitsOfMeasureService } from './units-of-measure.service';

const FAKE_TRX = { __trx: true } as unknown as Kysely<TenantDatabase>;
const FAKE_DB = {
  transaction: () => ({
    execute: (cb: (trx: Kysely<TenantDatabase>) => unknown) => cb(FAKE_TRX),
  }),
} as unknown as Kysely<TenantDatabase>;

function makeLocation(overrides: Partial<WarehouseLocation> = {}): WarehouseLocation {
  return {
    id: 'loc-1',
    warehouseId: 'wh-1',
    code: 'DEFAULT',
    name: 'الموقع الرئيسي',
    isActive: true,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

function makeStockLevel(overrides: Partial<StockLevel> = {}): StockLevel {
  return {
    id: 'level-1',
    productVariantId: 'variant-1',
    locationId: 'loc-1',
    warehouseId: 'wh-1',
    quantityOnHand: 10,
    reorderPoint: null,
    averageCost: Money.fromMinorUnits(1000, 'EGP'), // 10.00
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

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

function makeMockStockLevelRepository(): jest.Mocked<StockLevelRepository> {
  return {
    list: jest.fn(),
    findByVariantAndLocation: jest.fn(),
    upsert: jest.fn(),
    setReorderPoint: jest.fn(),
  };
}

function makeMockMovementRepository(): jest.Mocked<StockMovementRepository> {
  return {
    list: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    linkRelatedMovement: jest.fn(),
  };
}

function makeMockLocationRepository(): jest.Mocked<WarehouseLocationRepository> {
  return {
    listByWarehouseId: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };
}

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: 'product-1',
    code: 'P-1',
    name: 'Product 1',
    description: null,
    unitOfMeasureId: 'uom-piece',
    trackVariants: false,
    trackingType: 'none',
    attributes: [],
    isActive: true,
    customFields: {},
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

function makeVariant(overrides: Partial<ProductVariant> = {}): ProductVariant {
  return {
    id: 'variant-1',
    productId: 'product-1',
    sku: 'P-1',
    attributeValues: {},
    barcode: null,
    isActive: true,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

function makeMockProductRepository(): jest.Mocked<ProductRepository> {
  return {
    list: jest.fn(),
    findById: jest.fn(),
    findByCode: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };
}

function makeMockProductVariantRepository(): jest.Mocked<ProductVariantRepository> {
  return {
    listByProductId: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };
}

function makeMockStockLotRepository(): jest.Mocked<StockLotRepository> {
  return {
    findByVariantAndLotNumber: jest.fn(),
    findById: jest.fn(),
    listByVariantId: jest.fn(),
    createLot: jest.fn(),
    findLevel: jest.fn(),
    upsertLevel: jest.fn(),
    listAvailableForFifo: jest.fn(),
    createConsumption: jest.fn(),
    listConsumptionsByMovementId: jest.fn(),
  };
}

function makeMockUnitsOfMeasureService(): jest.Mocked<Pick<UnitsOfMeasureService, 'convert'>> {
  return {
    convert: jest.fn(),
  };
}

describe('StockMovementsService', () => {
  let stockLevels: jest.Mocked<StockLevelRepository>;
  let movements: jest.Mocked<StockMovementRepository>;
  let locations: jest.Mocked<WarehouseLocationRepository>;
  let productVariants: jest.Mocked<ProductVariantRepository>;
  let products: jest.Mocked<ProductRepository>;
  let stockLots: jest.Mocked<StockLotRepository>;
  let unitsOfMeasure: jest.Mocked<Pick<UnitsOfMeasureService, 'convert'>>;
  let service: StockMovementsService;

  beforeEach(() => {
    movementCounter = 0;
    stockLevels = makeMockStockLevelRepository();
    movements = makeMockMovementRepository();
    locations = makeMockLocationRepository();
    productVariants = makeMockProductVariantRepository();
    products = makeMockProductRepository();
    stockLots = makeMockStockLotRepository();
    unitsOfMeasure = makeMockUnitsOfMeasureService();
    service = new StockMovementsService(
      stockLevels,
      movements,
      locations,
      productVariants,
      products,
      stockLots,
      unitsOfMeasure as unknown as UnitsOfMeasureService,
    );
    locations.findById.mockResolvedValue(makeLocation());
    productVariants.findById.mockResolvedValue(makeVariant());
    products.findById.mockResolvedValue(makeProduct());
    stockLots.listAvailableForFifo.mockResolvedValue([]);
    movements.create.mockImplementation(async (_db, row) =>
      makeMovement({
        productVariantId: row.productVariantId,
        locationId: row.locationId,
        warehouseId: row.warehouseId,
        movementType: row.movementType,
        quantity: row.quantity,
        unitCost: row.unitCost,
        resultingAverageCost: row.resultingAverageCost,
        stockLotId: row.stockLotId ?? null,
      }),
    );
  });

  describe('recordMovement() — incoming ("in")', () => {
    it('requires a unit cost', async () => {
      await expect(
        service.recordMovement(FAKE_DB, {
          productVariantId: 'variant-1',
          locationId: 'loc-1',
          movementType: 'in',
          quantity: 5,
        }),
      ).rejects.toThrow(BusinessRuleError);
    });

    it('throws NotFoundError when the location does not exist', async () => {
      locations.findById.mockResolvedValue(null);

      await expect(
        service.recordMovement(FAKE_DB, {
          productVariantId: 'variant-1',
          locationId: 'missing-location',
          movementType: 'in',
          quantity: 5,
          unitCost: Money.fromMinorUnits(1000, 'EGP'),
        }),
      ).rejects.toThrow(NotFoundError);
    });

    it('sets the average cost to the unit cost on the first-ever movement (no existing stock level)', async () => {
      stockLevels.findByVariantAndLocation.mockResolvedValue(null);

      const result = await service.recordMovement(FAKE_DB, {
        productVariantId: 'variant-1',
        locationId: 'loc-1',
        movementType: 'in',
        quantity: 10,
        unitCost: Money.fromMinorUnits(1000, 'EGP'),
      });

      expect(stockLevels.upsert).toHaveBeenCalledWith(FAKE_TRX, {
        productVariantId: 'variant-1',
        locationId: 'loc-1',
        warehouseId: 'wh-1',
        quantityOnHand: 10,
        averageCost: expect.objectContaining({ currency: 'EGP' }),
      });
      const upsertArg = stockLevels.upsert.mock.calls[0][1];
      expect(upsertArg.averageCost.toMinorUnits()).toBe(1000n);
      expect(result.resultingAverageCost.toMinorUnits()).toBe(1000n);
    });

    it('recalculates the weighted average when stock already exists', async () => {
      // 10 units @ 10.00 (existing) + 10 units @ 12.00 (incoming) = 220.00 / 20 = 11.00
      stockLevels.findByVariantAndLocation.mockResolvedValue(
        makeStockLevel({ quantityOnHand: 10, averageCost: Money.fromMinorUnits(1000, 'EGP') }),
      );

      await service.recordMovement(FAKE_DB, {
        productVariantId: 'variant-1',
        locationId: 'loc-1',
        movementType: 'in',
        quantity: 10,
        unitCost: Money.fromMinorUnits(1200, 'EGP'),
      });

      const upsertArg = stockLevels.upsert.mock.calls[0][1];
      expect(upsertArg.quantityOnHand).toBe(20);
      expect(upsertArg.averageCost.toMinorUnits()).toBe(1100n); // 11.00
    });

    it('rejects a currency mismatch against the existing average cost', async () => {
      stockLevels.findByVariantAndLocation.mockResolvedValue(
        makeStockLevel({ averageCost: Money.fromMinorUnits(1000, 'EGP') }),
      );

      await expect(
        service.recordMovement(FAKE_DB, {
          productVariantId: 'variant-1',
          locationId: 'loc-1',
          movementType: 'in',
          quantity: 5,
          unitCost: Money.fromMinorUnits(100, 'USD'),
        }),
      ).rejects.toThrow(BusinessRuleError);
    });

    it('rejects a non-positive quantity', async () => {
      await expect(
        service.recordMovement(FAKE_DB, {
          productVariantId: 'variant-1',
          locationId: 'loc-1',
          movementType: 'in',
          quantity: 0,
          unitCost: Money.fromMinorUnits(1000, 'EGP'),
        }),
      ).rejects.toThrow(BusinessRuleError);
    });
  });

  describe('recordMovement() — adjustment_increase', () => {
    it('falls back to the current average cost when no unit cost is given', async () => {
      stockLevels.findByVariantAndLocation.mockResolvedValue(
        makeStockLevel({ quantityOnHand: 10, averageCost: Money.fromMinorUnits(1000, 'EGP') }),
      );

      await service.recordMovement(FAKE_DB, {
        productVariantId: 'variant-1',
        locationId: 'loc-1',
        movementType: 'adjustment_increase',
        quantity: 5,
      });

      const upsertArg = stockLevels.upsert.mock.calls[0][1];
      expect(upsertArg.quantityOnHand).toBe(15);
      expect(upsertArg.averageCost.toMinorUnits()).toBe(1000n); // unchanged
    });

    it('throws when there is no existing stock and no unit cost to fall back on', async () => {
      stockLevels.findByVariantAndLocation.mockResolvedValue(null);

      await expect(
        service.recordMovement(FAKE_DB, {
          productVariantId: 'variant-1',
          locationId: 'loc-1',
          movementType: 'adjustment_increase',
          quantity: 5,
        }),
      ).rejects.toThrow(BusinessRuleError);
    });
  });

  describe('recordMovement() — outgoing ("out" / "adjustment_decrease")', () => {
    it('decreases quantity without changing the average cost', async () => {
      stockLevels.findByVariantAndLocation.mockResolvedValue(
        makeStockLevel({ quantityOnHand: 10, averageCost: Money.fromMinorUnits(1000, 'EGP') }),
      );

      const result = await service.recordMovement(FAKE_DB, {
        productVariantId: 'variant-1',
        locationId: 'loc-1',
        movementType: 'out',
        quantity: 4,
      });

      const upsertArg = stockLevels.upsert.mock.calls[0][1];
      expect(upsertArg.quantityOnHand).toBe(6);
      expect(upsertArg.averageCost.toMinorUnits()).toBe(1000n);
      expect(result.resultingAverageCost.toMinorUnits()).toBe(1000n);
    });

    it('rejects a movement that would take quantity negative', async () => {
      stockLevels.findByVariantAndLocation.mockResolvedValue(makeStockLevel({ quantityOnHand: 3 }));

      await expect(
        service.recordMovement(FAKE_DB, {
          productVariantId: 'variant-1',
          locationId: 'loc-1',
          movementType: 'out',
          quantity: 4,
        }),
      ).rejects.toThrow(/Insufficient stock/);
    });

    it('rejects any outgoing movement when there is no stock at all', async () => {
      stockLevels.findByVariantAndLocation.mockResolvedValue(null);

      await expect(
        service.recordMovement(FAKE_DB, {
          productVariantId: 'variant-1',
          locationId: 'loc-1',
          movementType: 'adjustment_decrease',
          quantity: 1,
        }),
      ).rejects.toThrow(BusinessRuleError);
    });
  });

  describe('recordMovement() — unit of measure conversion', () => {
    it('converts quantity and unit cost to the product\'s base unit when unitOfMeasureId differs', async () => {
      // Product is stock-kept in "piece" (uom-piece); caller records a purchase of 1 box (uom-box)
      // containing 12 pieces, at 120.00 per box -> should persist as 12 pieces @ 10.00/piece.
      products.findById.mockResolvedValue(makeProduct({ unitOfMeasureId: 'uom-piece' }));
      unitsOfMeasure.convert.mockResolvedValue(12);
      stockLevels.findByVariantAndLocation.mockResolvedValue(null);

      const result = await service.recordMovement(FAKE_DB, {
        productVariantId: 'variant-1',
        locationId: 'loc-1',
        movementType: 'in',
        quantity: 1,
        unitOfMeasureId: 'uom-box',
        unitCost: Money.fromMinorUnits(12000, 'EGP'), // 120.00 per box
      });

      expect(unitsOfMeasure.convert).toHaveBeenCalledWith(FAKE_TRX, 'uom-box', 'uom-piece', 1);
      const upsertArg = stockLevels.upsert.mock.calls[0][1];
      expect(upsertArg.quantityOnHand).toBe(12);
      expect(upsertArg.averageCost.toMinorUnits()).toBe(1000n); // 10.00 per piece
      expect(result.quantity).toBe(12);
    });

    it('skips conversion when unitOfMeasureId matches the product\'s own unit', async () => {
      products.findById.mockResolvedValue(makeProduct({ unitOfMeasureId: 'uom-piece' }));
      stockLevels.findByVariantAndLocation.mockResolvedValue(null);

      await service.recordMovement(FAKE_DB, {
        productVariantId: 'variant-1',
        locationId: 'loc-1',
        movementType: 'in',
        quantity: 5,
        unitOfMeasureId: 'uom-piece',
        unitCost: Money.fromMinorUnits(1000, 'EGP'),
      });

      expect(unitsOfMeasure.convert).not.toHaveBeenCalled();
      expect(stockLevels.upsert.mock.calls[0][1].quantityOnHand).toBe(5);
    });

    it('throws NotFoundError when the product variant does not exist', async () => {
      productVariants.findById.mockResolvedValue(null);

      await expect(
        service.recordMovement(FAKE_DB, {
          productVariantId: 'missing-variant',
          locationId: 'loc-1',
          movementType: 'in',
          quantity: 1,
          unitOfMeasureId: 'uom-box',
          unitCost: Money.fromMinorUnits(1000, 'EGP'),
        }),
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('recordMovement() — lot/serial tracking', () => {
    it('requires a lotNumber when receiving a lot-tracked product', async () => {
      products.findById.mockResolvedValue(makeProduct({ trackingType: 'lot' }));

      await expect(
        service.recordMovement(FAKE_DB, {
          productVariantId: 'variant-1',
          locationId: 'loc-1',
          movementType: 'in',
          quantity: 10,
          unitCost: Money.fromMinorUnits(1000, 'EGP'),
        }),
      ).rejects.toThrow(/lot number is required/);
    });

    it('creates a new lot on first receipt and stamps the movement with its id', async () => {
      products.findById.mockResolvedValue(makeProduct({ trackingType: 'lot' }));
      stockLots.findByVariantAndLotNumber.mockResolvedValue(null);
      stockLots.createLot.mockResolvedValue({
        id: 'lot-1',
        productVariantId: 'variant-1',
        lotNumber: 'LOT-001',
        expiryDate: null,
        unitCost: Money.fromMinorUnits(1000, 'EGP'),
        createdAt: new Date('2026-01-01T00:00:00Z'),
        updatedAt: new Date('2026-01-01T00:00:00Z'),
      });
      stockLots.findLevel.mockResolvedValue(null);
      stockLevels.findByVariantAndLocation.mockResolvedValue(null);

      const result = await service.recordMovement(FAKE_DB, {
        productVariantId: 'variant-1',
        locationId: 'loc-1',
        movementType: 'in',
        quantity: 10,
        lotNumber: 'LOT-001',
        unitCost: Money.fromMinorUnits(1000, 'EGP'),
      });

      expect(stockLots.createLot).toHaveBeenCalledWith(FAKE_TRX, {
        productVariantId: 'variant-1',
        lotNumber: 'LOT-001',
        expiryDate: null,
        unitCost: expect.objectContaining({ currency: 'EGP' }),
      });
      expect(stockLots.upsertLevel).toHaveBeenCalledWith(FAKE_TRX, {
        stockLotId: 'lot-1',
        locationId: 'loc-1',
        warehouseId: 'wh-1',
        quantityOnHand: 10,
      });
      expect(result.stockLotId).toBe('lot-1');
    });

    it('adds quantity to an existing lot without creating a duplicate', async () => {
      products.findById.mockResolvedValue(makeProduct({ trackingType: 'lot' }));
      stockLots.findByVariantAndLotNumber.mockResolvedValue({
        id: 'lot-1',
        productVariantId: 'variant-1',
        lotNumber: 'LOT-001',
        expiryDate: null,
        unitCost: Money.fromMinorUnits(1000, 'EGP'),
        createdAt: new Date('2026-01-01T00:00:00Z'),
        updatedAt: new Date('2026-01-01T00:00:00Z'),
      });
      stockLots.findLevel.mockResolvedValue({
        id: 'level-lot-1',
        stockLotId: 'lot-1',
        locationId: 'loc-1',
        warehouseId: 'wh-1',
        quantityOnHand: 5,
        createdAt: new Date('2026-01-01T00:00:00Z'),
        updatedAt: new Date('2026-01-01T00:00:00Z'),
      });
      stockLevels.findByVariantAndLocation.mockResolvedValue(
        makeStockLevel({ quantityOnHand: 5, averageCost: Money.fromMinorUnits(1000, 'EGP') }),
      );

      await service.recordMovement(FAKE_DB, {
        productVariantId: 'variant-1',
        locationId: 'loc-1',
        movementType: 'in',
        quantity: 5,
        lotNumber: 'LOT-001',
        unitCost: Money.fromMinorUnits(1000, 'EGP'),
      });

      expect(stockLots.createLot).not.toHaveBeenCalled();
      expect(stockLots.upsertLevel).toHaveBeenCalledWith(FAKE_TRX, {
        stockLotId: 'lot-1',
        locationId: 'loc-1',
        warehouseId: 'wh-1',
        quantityOnHand: 10, // 5 existing + 5 incoming
      });
    });

    it('rejects a serial-tracked receipt whose quantity is not exactly 1', async () => {
      products.findById.mockResolvedValue(makeProduct({ trackingType: 'serial' }));

      await expect(
        service.recordMovement(FAKE_DB, {
          productVariantId: 'variant-1',
          locationId: 'loc-1',
          movementType: 'in',
          quantity: 2,
          lotNumber: 'SN-001',
          unitCost: Money.fromMinorUnits(1000, 'EGP'),
        }),
      ).rejects.toThrow(/exactly one unit/);
    });

    it('consumes from a single available lot via FIFO-by-expiry and stamps the movement with it', async () => {
      products.findById.mockResolvedValue(makeProduct({ trackingType: 'lot' }));
      stockLevels.findByVariantAndLocation.mockResolvedValue(
        makeStockLevel({ quantityOnHand: 10, averageCost: Money.fromMinorUnits(1000, 'EGP') }),
      );
      stockLots.listAvailableForFifo.mockResolvedValue([
        { stockLotId: 'lot-1', lotNumber: 'LOT-001', expiryDate: new Date('2026-06-01'), quantityAvailable: 10 },
      ]);

      const result = await service.recordMovement(FAKE_DB, {
        productVariantId: 'variant-1',
        locationId: 'loc-1',
        movementType: 'out',
        quantity: 4,
      });

      expect(stockLots.upsertLevel).toHaveBeenCalledWith(FAKE_TRX, {
        stockLotId: 'lot-1',
        locationId: 'loc-1',
        warehouseId: 'wh-1',
        quantityOnHand: 6,
      });
      expect(stockLots.createConsumption).not.toHaveBeenCalled();
      expect(result.stockLotId).toBe('lot-1');
    });

    it('splits FIFO consumption across multiple lots and records a consumption row per lot, leaving the movement lot-less', async () => {
      products.findById.mockResolvedValue(makeProduct({ trackingType: 'lot' }));
      stockLevels.findByVariantAndLocation.mockResolvedValue(
        makeStockLevel({ quantityOnHand: 15, averageCost: Money.fromMinorUnits(1000, 'EGP') }),
      );
      stockLots.listAvailableForFifo.mockResolvedValue([
        { stockLotId: 'lot-early', lotNumber: 'LOT-EARLY', expiryDate: new Date('2026-03-01'), quantityAvailable: 5 },
        { stockLotId: 'lot-late', lotNumber: 'LOT-LATE', expiryDate: new Date('2026-09-01'), quantityAvailable: 10 },
      ]);

      const result = await service.recordMovement(FAKE_DB, {
        productVariantId: 'variant-1',
        locationId: 'loc-1',
        movementType: 'out',
        quantity: 8, // exhausts lot-early (5) then draws 3 from lot-late
      });

      expect(stockLots.upsertLevel).toHaveBeenNthCalledWith(1, FAKE_TRX, {
        stockLotId: 'lot-early',
        locationId: 'loc-1',
        warehouseId: 'wh-1',
        quantityOnHand: 0,
      });
      expect(stockLots.upsertLevel).toHaveBeenNthCalledWith(2, FAKE_TRX, {
        stockLotId: 'lot-late',
        locationId: 'loc-1',
        warehouseId: 'wh-1',
        quantityOnHand: 7,
      });
      expect(stockLots.createConsumption).toHaveBeenCalledWith(FAKE_TRX, {
        stockMovementId: result.id,
        stockLotId: 'lot-early',
        quantity: 5,
      });
      expect(stockLots.createConsumption).toHaveBeenCalledWith(FAKE_TRX, {
        stockMovementId: result.id,
        stockLotId: 'lot-late',
        quantity: 3,
      });
      expect(result.stockLotId).toBeNull();
    });

    it('consumes from an explicitly chosen lot instead of FIFO when lotId is given', async () => {
      products.findById.mockResolvedValue(makeProduct({ trackingType: 'lot' }));
      stockLevels.findByVariantAndLocation.mockResolvedValue(
        makeStockLevel({ quantityOnHand: 10, averageCost: Money.fromMinorUnits(1000, 'EGP') }),
      );
      stockLots.findLevel.mockResolvedValue({
        id: 'level-x',
        stockLotId: 'lot-chosen',
        locationId: 'loc-1',
        warehouseId: 'wh-1',
        quantityOnHand: 6,
        createdAt: new Date('2026-01-01T00:00:00Z'),
        updatedAt: new Date('2026-01-01T00:00:00Z'),
      });

      const result = await service.recordMovement(FAKE_DB, {
        productVariantId: 'variant-1',
        locationId: 'loc-1',
        movementType: 'out',
        quantity: 4,
        lotId: 'lot-chosen',
      });

      expect(stockLots.listAvailableForFifo).not.toHaveBeenCalled();
      expect(stockLots.upsertLevel).toHaveBeenCalledWith(FAKE_TRX, {
        stockLotId: 'lot-chosen',
        locationId: 'loc-1',
        warehouseId: 'wh-1',
        quantityOnHand: 2,
      });
      expect(result.stockLotId).toBe('lot-chosen');
    });

    it('rejects an outgoing lot-tracked movement when total lot-tracked quantity is insufficient', async () => {
      products.findById.mockResolvedValue(makeProduct({ trackingType: 'lot' }));
      stockLevels.findByVariantAndLocation.mockResolvedValue(
        makeStockLevel({ quantityOnHand: 100, averageCost: Money.fromMinorUnits(1000, 'EGP') }),
      );
      stockLots.listAvailableForFifo.mockResolvedValue([
        { stockLotId: 'lot-1', lotNumber: 'LOT-001', expiryDate: null, quantityAvailable: 2 },
      ]);

      await expect(
        service.recordMovement(FAKE_DB, {
          productVariantId: 'variant-1',
          locationId: 'loc-1',
          movementType: 'out',
          quantity: 5,
        }),
      ).rejects.toThrow(/Insufficient lot-tracked stock/);
    });
  });

  describe('transferStock()', () => {
    it('rejects transferring to the same location', async () => {
      await expect(
        service.transferStock(FAKE_DB, {
          productVariantId: 'variant-1',
          quantity: 1,
          fromLocationId: 'loc-1',
          toLocationId: 'loc-1',
        }),
      ).rejects.toThrow(BusinessRuleError);
    });

    it('moves quantity out of the source and into the destination at the source’s current cost', async () => {
      locations.findById.mockImplementation(async (_db, locationId) =>
        makeLocation({ id: locationId, warehouseId: locationId === 'loc-source' ? 'wh-source' : 'wh-dest' }),
      );
      stockLevels.findByVariantAndLocation.mockImplementation(async (_db, _variantId, locationId) => {
        if (locationId === 'loc-source') {
          return makeStockLevel({
            locationId: 'loc-source',
            warehouseId: 'wh-source',
            quantityOnHand: 10,
            averageCost: Money.fromMinorUnits(1500, 'EGP'), // 15.00
          });
        }
        return null; // destination has no stock yet
      });

      const result = await service.transferStock(FAKE_DB, {
        productVariantId: 'variant-1',
        quantity: 4,
        fromLocationId: 'loc-source',
        toLocationId: 'loc-dest',
      });

      expect(stockLevels.upsert).toHaveBeenNthCalledWith(1, FAKE_TRX, {
        productVariantId: 'variant-1',
        locationId: 'loc-source',
        warehouseId: 'wh-source',
        quantityOnHand: 6,
        averageCost: expect.objectContaining({ currency: 'EGP' }),
      });
      expect(stockLevels.upsert.mock.calls[0][1].averageCost.toMinorUnits()).toBe(1500n);

      expect(stockLevels.upsert.mock.calls[1][1]).toMatchObject({
        productVariantId: 'variant-1',
        locationId: 'loc-dest',
        warehouseId: 'wh-dest',
        quantityOnHand: 4,
      });
      expect(stockLevels.upsert.mock.calls[1][1].averageCost.toMinorUnits()).toBe(1500n);

      expect(movements.linkRelatedMovement).toHaveBeenCalledTimes(2);
      expect(result.transferOut.relatedMovementId).toBe(result.transferIn.id);
      expect(result.transferIn.relatedMovementId).toBe(result.transferOut.id);
    });

    it('rejects the transfer when the source location has insufficient stock', async () => {
      stockLevels.findByVariantAndLocation.mockResolvedValue(makeStockLevel({ quantityOnHand: 2 }));

      await expect(
        service.transferStock(FAKE_DB, {
          productVariantId: 'variant-1',
          quantity: 5,
          fromLocationId: 'loc-source',
          toLocationId: 'loc-dest',
        }),
      ).rejects.toThrow(/Insufficient stock/);
    });

    it('requires an explicit lotId when transferring a lot-tracked product', async () => {
      products.findById.mockResolvedValue(makeProduct({ trackingType: 'lot' }));
      stockLevels.findByVariantAndLocation.mockResolvedValue(makeStockLevel({ quantityOnHand: 10 }));

      await expect(
        service.transferStock(FAKE_DB, {
          productVariantId: 'variant-1',
          quantity: 4,
          fromLocationId: 'loc-source',
          toLocationId: 'loc-dest',
        }),
      ).rejects.toThrow(/lotId/);
    });

    it('moves the specified lot\'s quantity between locations when lotId is given', async () => {
      products.findById.mockResolvedValue(makeProduct({ trackingType: 'lot' }));
      locations.findById.mockImplementation(async (_db, locationId) =>
        makeLocation({ id: locationId, warehouseId: locationId === 'loc-source' ? 'wh-source' : 'wh-dest' }),
      );
      stockLevels.findByVariantAndLocation.mockImplementation(async (_db, _variantId, locationId) =>
        locationId === 'loc-source'
          ? makeStockLevel({ locationId: 'loc-source', warehouseId: 'wh-source', quantityOnHand: 10 })
          : null,
      );
      stockLots.findLevel.mockImplementation(async (_db, _lotId, locationId) =>
        locationId === 'loc-source'
          ? {
              id: 'level-source',
              stockLotId: 'lot-1',
              locationId: 'loc-source',
              warehouseId: 'wh-source',
              quantityOnHand: 10,
              createdAt: new Date('2026-01-01T00:00:00Z'),
              updatedAt: new Date('2026-01-01T00:00:00Z'),
            }
          : null,
      );

      const result = await service.transferStock(FAKE_DB, {
        productVariantId: 'variant-1',
        quantity: 4,
        fromLocationId: 'loc-source',
        toLocationId: 'loc-dest',
        lotId: 'lot-1',
      });

      expect(stockLots.upsertLevel).toHaveBeenCalledWith(FAKE_TRX, {
        stockLotId: 'lot-1',
        locationId: 'loc-source',
        warehouseId: 'wh-source',
        quantityOnHand: 6,
      });
      expect(stockLots.upsertLevel).toHaveBeenCalledWith(FAKE_TRX, {
        stockLotId: 'lot-1',
        locationId: 'loc-dest',
        warehouseId: 'wh-dest',
        quantityOnHand: 4,
      });
      expect(result.transferOut.stockLotId).toBe('lot-1');
      expect(result.transferIn.stockLotId).toBe('lot-1');
    });
  });
});

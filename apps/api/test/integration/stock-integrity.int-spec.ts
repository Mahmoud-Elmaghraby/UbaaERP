import { randomUUID } from 'node:crypto';
import { sql, type Kysely } from 'kysely';
import { Money } from '@erp-platform/shared-kernel';
import type { TenantDatabase } from '../../src/database/tenant/kysely-client';
import { StockMovementsService } from '../../src/modules/inventory/application/services/stock-movements.service';
import { UnitsOfMeasureService } from '../../src/modules/inventory/application/services/units-of-measure.service';
import { KyselyStockLevelRepository } from '../../src/modules/inventory/infrastructure/persistence/kysely-stock-level.repository';
import { KyselyStockMovementRepository } from '../../src/modules/inventory/infrastructure/persistence/kysely-stock-movement.repository';
import { KyselyWarehouseLocationRepository } from '../../src/modules/inventory/infrastructure/persistence/kysely-warehouse-location.repository';
import { KyselyProductVariantRepository } from '../../src/modules/inventory/infrastructure/persistence/kysely-product-variant.repository';
import { KyselyProductRepository } from '../../src/modules/inventory/infrastructure/persistence/kysely-product.repository';
import { KyselyStockLotRepository } from '../../src/modules/inventory/infrastructure/persistence/kysely-stock-lot.repository';
import { KyselyUnitOfMeasureRepository } from '../../src/modules/inventory/infrastructure/persistence/kysely-unit-of-measure.repository';
import { GoodsReceiptStockListener } from '../../src/modules/inventory/infrastructure/events/goods-receipt-stock.listener';
import { DeliveryStockListener } from '../../src/modules/inventory/infrastructure/events/delivery-stock.listener';
import { OutboxWriterService } from '../../src/shared/outbox/application/services/outbox-writer.service';
import { KyselyOutboxEventRepository } from '../../src/shared/outbox/infrastructure/persistence/kysely-outbox-event.repository';
import type { TenantConnectionManager } from '../../src/shared/tenancy/tenant-connection-manager';
import type { DomainEventPayload } from '../../src/shared/events/domain-event';
import { openIntegrationDb, uniqueSuffix } from './tenant-db';

/**
 * Stock integrity under concurrency (inventory audit 2026-10, finding C1):
 * stock_levels is read, recalculated in JS, then written back as an
 * absolute value — without serialization two concurrent movements on the
 * same (variant, location) silently lose one update. These tests fire
 * movements truly in parallel (separate pooled connections) and assert
 * the final balance is exact.
 */
describe('StockMovementsService (integration, real Postgres) — concurrency & nesting', () => {
  let db: Kysely<TenantDatabase>;
  let service: StockMovementsService;
  let locationA: string;
  let locationB: string;

  async function createProduct(trackingType: 'none' | 'lot' | 'serial' = 'none'): Promise<string> {
    const suffix = uniqueSuffix();
    const unitId = randomUUID();
    await db
      .insertInto('units_of_measure')
      .values({ id: unitId, name: `pc-${suffix}`, symbol: `pc${suffix}`, is_active: true, conversion_factor: '1' })
      .execute();
    const productId = randomUUID();
    await db
      .insertInto('products')
      .values({
        id: productId,
        code: `P-${suffix}`,
        name: `Product ${suffix}`,
        unit_of_measure_id: unitId,
        tracking_type: trackingType,
        is_active: true,
        track_variants: false,
      })
      .execute();
    const variantId = randomUUID();
    await db
      .insertInto('product_variants')
      .values({ id: variantId, product_id: productId, sku: `SKU-${suffix}`, is_active: true })
      .execute();
    return variantId;
  }

  async function quantityAt(variantId: string, locationId: string): Promise<number> {
    const row = await db
      .selectFrom('stock_levels')
      .select('quantity_on_hand')
      .where('product_variant_id', '=', variantId)
      .where('location_id', '=', locationId)
      .executeTakeFirst();
    return row ? Number(row.quantity_on_hand) : 0;
  }

  beforeAll(async () => {
    db = openIntegrationDb();
    service = new StockMovementsService(
      new KyselyStockLevelRepository(),
      new KyselyStockMovementRepository(),
      new KyselyWarehouseLocationRepository(),
      new KyselyProductVariantRepository(),
      new KyselyProductRepository(),
      new KyselyStockLotRepository(),
      new UnitsOfMeasureService(new KyselyUnitOfMeasureRepository()),
    );
    const suffix = uniqueSuffix();
    const warehouseId = randomUUID();
    await db
      .insertInto('warehouses')
      .values({ id: warehouseId, name: `WH ${suffix}`, code: `WH-${suffix}`, is_active: true })
      .execute();
    locationA = randomUUID();
    locationB = randomUUID();
    await db
      .insertInto('warehouse_locations')
      .values([
        { id: locationA, warehouse_id: warehouseId, code: `A-${suffix}`, name: 'A', is_active: true },
        { id: locationB, warehouse_id: warehouseId, code: `B-${suffix}`, name: 'B', is_active: true },
      ])
      .execute();
  });

  afterAll(async () => {
    await db.destroy();
  });

  it('can be called inside a caller-owned transaction (document listeners do this)', async () => {
    const variantId = await createProduct();
    await db.transaction().execute(async (trx) => {
      await service.recordMovement(trx, {
        productVariantId: variantId,
        locationId: locationA,
        movementType: 'in',
        quantity: 3,
        unitCost: Money.fromMinorUnits(1000n, 'EGP'),
      });
      await service.recordMovement(trx, {
        productVariantId: variantId,
        locationId: locationA,
        movementType: 'out',
        quantity: 1,
      });
    });
    expect(await quantityAt(variantId, locationA)).toBe(2);
  });

  it('never loses an update when many incoming movements hit a brand-new (variant, location) at once', async () => {
    const variantId = await createProduct();
    await Promise.all(
      Array.from({ length: 8 }, (_, i) =>
        service.recordMovement(db, {
          productVariantId: variantId,
          locationId: locationA,
          movementType: 'in',
          quantity: 1,
          unitCost: Money.fromMinorUnits(BigInt(1000 + i * 100), 'EGP'),
        }),
      ),
    );
    expect(await quantityAt(variantId, locationA)).toBe(8);
  });

  it('never oversells: concurrent outgoing movements cannot push stock below zero', async () => {
    const variantId = await createProduct();
    await service.recordMovement(db, {
      productVariantId: variantId,
      locationId: locationA,
      movementType: 'in',
      quantity: 5,
      unitCost: Money.fromMinorUnits(1000n, 'EGP'),
    });
    const results = await Promise.allSettled(
      Array.from({ length: 8 }, () =>
        service.recordMovement(db, {
          productVariantId: variantId,
          locationId: locationA,
          movementType: 'out',
          quantity: 1,
        }),
      ),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(5);
    expect(await quantityAt(variantId, locationA)).toBe(0);
  });

  it('opposite-direction transfers running at the same time neither deadlock nor lose stock', async () => {
    const variantId = await createProduct();
    for (const locationId of [locationA, locationB]) {
      await service.recordMovement(db, {
        productVariantId: variantId,
        locationId,
        movementType: 'in',
        quantity: 10,
        unitCost: Money.fromMinorUnits(1000n, 'EGP'),
      });
    }
    await Promise.all(
      Array.from({ length: 6 }, (_, i) =>
        service.transferStock(db, {
          productVariantId: variantId,
          fromLocationId: i % 2 === 0 ? locationA : locationB,
          toLocationId: i % 2 === 0 ? locationB : locationA,
          quantity: 1,
        }),
      ),
    );
    expect((await quantityAt(variantId, locationA)) + (await quantityAt(variantId, locationB))).toBe(20);
  });

  it('accepts a new valuation currency once the location has been emptied to zero', async () => {
    const variantId = await createProduct();
    const base = { productVariantId: variantId, locationId: locationA } as const;
    await service.recordMovement(db, {
      ...base,
      movementType: 'in',
      quantity: 1,
      unitCost: Money.fromMinorUnits(1000n, 'EGP'),
    });
    await service.recordMovement(db, { ...base, movementType: 'out', quantity: 1 });
    const movement = await service.recordMovement(db, {
      ...base,
      movementType: 'in',
      quantity: 2,
      unitCost: Money.fromMinorUnits(500n, 'USD'),
    });
    expect(movement.resultingAverageCost?.currency).toBe('USD');
  });

  it('rejects receiving the same serial number twice while it is still in stock', async () => {
    const variantId = await createProduct('serial');
    const base = {
      productVariantId: variantId,
      locationId: locationA,
      quantity: 1,
      unitCost: Money.fromMinorUnits(1000n, 'EGP'),
    };
    await service.recordMovement(db, { ...base, movementType: 'in', lotNumber: 'SN-1' });
    await expect(service.recordMovement(db, { ...base, movementType: 'in', lotNumber: 'SN-1' })).rejects.toMatchObject({
      code: 'STOCK_MOVEMENT.SERIAL_ALREADY_IN_STOCK',
    });
  });

  it('rejects a negative unit cost', async () => {
    const variantId = await createProduct();
    await expect(
      service.recordMovement(db, {
        productVariantId: variantId,
        locationId: locationA,
        movementType: 'in',
        quantity: 1,
        unitCost: Money.fromMinorUnits(-100n, 'EGP'),
      }),
    ).rejects.toMatchObject({ code: 'STOCK_MOVEMENT.UNIT_COST_NEGATIVE' });
  });

  describe('document stock listeners (outbox-delivered)', () => {
    let warehouseId: string;
    let defaultLocationId: string;
    let receiptListener: GoodsReceiptStockListener;
    let deliveryListener: DeliveryStockListener;

    function event(entityId: string, lines: Array<Record<string, unknown>>): DomainEventPayload {
      return {
        schema: 'ignored-by-stub',
        entityType: 'document',
        entityId,
        action: 'confirmed',
        actorUserId: null,
        metadata: { warehouseId, lines },
        occurredAt: new Date(),
      } as DomainEventPayload;
    }

    beforeAll(async () => {
      const suffix = uniqueSuffix();
      warehouseId = randomUUID();
      defaultLocationId = randomUUID();
      await db
        .insertInto('warehouses')
        .values({ id: warehouseId, name: `WH2 ${suffix}`, code: `W2-${suffix}`, is_active: true })
        .execute();
      await db
        .insertInto('warehouse_locations')
        .values({ id: defaultLocationId, warehouse_id: warehouseId, code: 'DEFAULT', name: 'Default', is_active: true })
        .execute();
      const connections = { getClient: () => db } as unknown as TenantConnectionManager;
      const locations = new KyselyWarehouseLocationRepository();
      receiptListener = new GoodsReceiptStockListener(service, locations, connections);
      deliveryListener = new DeliveryStockListener(
        service,
        locations,
        connections,
        new OutboxWriterService(new KyselyOutboxEventRepository()),
      );
    });

    it('applies a redelivered goods receipt only once', async () => {
      const variantId = await createProduct();
      const receipt = event(randomUUID(), [
        { productVariantId: variantId, quantity: 5, unitCost: { amountMinorUnits: '1000', currency: 'EGP' } },
      ]);
      await receiptListener.handle(receipt);
      await receiptListener.handle(receipt);
      expect(await quantityAt(variantId, defaultLocationId)).toBe(5);
    });

    it('decreases stock on delivery and writes exactly one COGS outbox event, even when redelivered', async () => {
      const variantId = await createProduct();
      await receiptListener.handle(
        event(randomUUID(), [
          { productVariantId: variantId, quantity: 5, unitCost: { amountMinorUnits: '1000', currency: 'EGP' } },
        ]),
      );
      const deliveryId = randomUUID();
      const delivery = event(deliveryId, [{ productVariantId: variantId, quantity: 2 }]);
      await deliveryListener.handle(delivery);
      await deliveryListener.handle(delivery);

      expect(await quantityAt(variantId, defaultLocationId)).toBe(3);
      const cogsEvents = await db
        .selectFrom('outbox_events')
        .select('id')
        .where('event_type', '=', 'inventory.stock_consumption.recorded')
        .where(sql`payload->>'entityId'`, '=', deliveryId)
        .execute();
      expect(cogsEvents).toHaveLength(1);
    });

    it('is all-or-nothing and rethrows (so the outbox retries) when one line lacks stock', async () => {
      const inStock = await createProduct();
      const outOfStock = await createProduct();
      await receiptListener.handle(
        event(randomUUID(), [
          { productVariantId: inStock, quantity: 4, unitCost: { amountMinorUnits: '1000', currency: 'EGP' } },
        ]),
      );
      await expect(
        deliveryListener.handle(
          event(randomUUID(), [
            { productVariantId: inStock, quantity: 1 },
            { productVariantId: outOfStock, quantity: 1 },
          ]),
        ),
      ).rejects.toMatchObject({ code: 'STOCK_MOVEMENT.INSUFFICIENT_STOCK' });
      expect(await quantityAt(inStock, defaultLocationId)).toBe(4);
    });
  });
});

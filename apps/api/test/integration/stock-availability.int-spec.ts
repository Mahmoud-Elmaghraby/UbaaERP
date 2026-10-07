import { randomUUID } from 'node:crypto';
import { sql, type Kysely } from 'kysely';
import { Money } from '@erp-platform/shared-kernel';
import type { TenantDatabase } from '../../src/database/tenant/kysely-client';
import { StockMovementsService } from '../../src/modules/inventory/application/services/stock-movements.service';
import { UnitsOfMeasureService } from '../../src/modules/inventory/application/services/units-of-measure.service';
import { KyselyProductRepository } from '../../src/modules/inventory/infrastructure/persistence/kysely-product.repository';
import { KyselyProductVariantRepository } from '../../src/modules/inventory/infrastructure/persistence/kysely-product-variant.repository';
import { KyselyStockLevelRepository } from '../../src/modules/inventory/infrastructure/persistence/kysely-stock-level.repository';
import { KyselyStockLotRepository } from '../../src/modules/inventory/infrastructure/persistence/kysely-stock-lot.repository';
import { KyselyStockMovementRepository } from '../../src/modules/inventory/infrastructure/persistence/kysely-stock-movement.repository';
import { KyselyUnitOfMeasureRepository } from '../../src/modules/inventory/infrastructure/persistence/kysely-unit-of-measure.repository';
import { KyselyWarehouseLocationRepository } from '../../src/modules/inventory/infrastructure/persistence/kysely-warehouse-location.repository';
import { StockAvailabilityChecker } from '../../src/shared/catalog/stock-availability-checker';
import { KyselyOutboxEventRepository } from '../../src/shared/outbox/infrastructure/persistence/kysely-outbox-event.repository';
import { openIntegrationDb, uniqueSuffix } from './tenant-db';

/** Stock is checked when a delivery / purchase return is confirmed; stuck background operations are recoverable. */
describe('Stock availability at confirm + background operations (integration, real Postgres)', () => {
  let db: Kysely<TenantDatabase>;
  let stock: StockMovementsService;
  const checker = new StockAvailabilityChecker();
  let warehouseId: string;
  let locationId: string;
  const days = (offset: number) => new Date(Date.now() + offset * 86_400_000);

  async function createProduct(trackingType: 'none' | 'lot' = 'none', itemType: 'stock' | 'service' = 'stock') {
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
        code: `A-${suffix}`,
        name: `Avail ${suffix}`,
        unit_of_measure_id: unitId,
        tracking_type: trackingType,
        item_type: itemType,
        is_active: true,
        track_variants: false,
      })
      .execute();
    const variantId = randomUUID();
    await db
      .insertInto('product_variants')
      .values({ id: variantId, product_id: productId, sku: `AV-${suffix}`, is_active: true })
      .execute();
    return variantId;
  }

  beforeAll(async () => {
    db = openIntegrationDb();
    stock = new StockMovementsService(
      new KyselyStockLevelRepository(),
      new KyselyStockMovementRepository(),
      new KyselyWarehouseLocationRepository(),
      new KyselyProductVariantRepository(),
      new KyselyProductRepository(),
      new KyselyStockLotRepository(),
      new UnitsOfMeasureService(new KyselyUnitOfMeasureRepository()),
    );
    const suffix = uniqueSuffix();
    warehouseId = randomUUID();
    locationId = randomUUID();
    await db
      .insertInto('warehouses')
      .values({ id: warehouseId, name: `AW ${suffix}`, code: `AW-${suffix}`, is_active: true })
      .execute();
    await db
      .insertInto('warehouse_locations')
      .values({ id: locationId, warehouse_id: warehouseId, code: 'DEFAULT', name: 'Default', is_active: true })
      .execute();
  });

  afterAll(async () => {
    await db.destroy();
  });

  it('refuses a delivery bigger than the stock, listing the item, and ignores service items', async () => {
    const goods = await createProduct();
    const service = await createProduct('none', 'service');
    await stock.recordMovement(db, {
      productVariantId: goods,
      locationId,
      movementType: 'in',
      quantity: 3,
      unitCost: Money.fromMinorUnits(100n, 'EGP'),
    });
    await expect(
      checker.assertAvailable(
        db,
        warehouseId,
        [
          { productVariantId: goods, quantity: 2 },
          { productVariantId: goods, quantity: 2 },
          { productVariantId: service, quantity: 9 },
        ],
        { blockExpired: true, errorCode: 'DELIVERY.INSUFFICIENT_STOCK' },
      ),
    ).rejects.toMatchObject({
      code: 'DELIVERY.INSUFFICIENT_STOCK',
      params: { details: expect.stringContaining('المتاح 3') },
    });
    await expect(
      checker.assertAvailable(db, warehouseId, [{ productVariantId: goods, quantity: 3 }], {
        blockExpired: true,
        errorCode: 'DELIVERY.INSUFFICIENT_STOCK',
      }),
    ).resolves.toBeUndefined();
  });

  it('counts only unexpired lots for sales, all lots for purchase returns, and checks picked lots', async () => {
    const variant = await createProduct('lot');
    for (const [lotNumber, expiry, quantity] of [
      ['OLD', days(-3), 4],
      ['NEW', days(90), 2],
    ] as const) {
      await stock.recordMovement(db, {
        productVariantId: variant,
        locationId,
        movementType: 'in',
        quantity,
        unitCost: Money.fromMinorUnits(100n, 'EGP'),
        lotNumber,
        expiryDate: expiry,
      });
    }
    const sale = (lines: Parameters<StockAvailabilityChecker['findShortages']>[2]) =>
      checker.findShortages(db, warehouseId, lines, true);
    expect(await sale([{ productVariantId: variant, quantity: 3 }])).toEqual([
      expect.objectContaining({ reason: 'insufficient', available: 2 }),
    ]);
    expect(await checker.findShortages(db, warehouseId, [{ productVariantId: variant, quantity: 6 }], false)).toEqual(
      [],
    );
    expect(await sale([{ productVariantId: variant, quantity: 1, lots: [{ lotNumber: 'OLD', quantity: 1 }] }])).toEqual(
      [expect.objectContaining({ reason: 'lot_expired', lotNumber: 'OLD' })],
    );
    expect(
      await sale([{ productVariantId: variant, quantity: 1, lots: [{ lotNumber: 'NOPE', quantity: 1 }] }]),
    ).toEqual([expect.objectContaining({ reason: 'lot_missing' })]);
  });

  it('re-claims an operation stuck in "processing" and lets a failed one be sent again', async () => {
    const outbox = new KyselyOutboxEventRepository();
    const stuck = await outbox.create(db, { eventType: 'test.stuck', payload: { entityType: 'x' } });
    await sql`UPDATE outbox_events SET status = 'processing', claimed_at = now() - interval '10 minutes' WHERE id = ${stuck.id}`.execute(
      db,
    );
    const claimed = await outbox.claimPending(db, 500);
    expect(claimed.map((event) => event.id)).toContain(stuck.id);

    const failed = await outbox.create(db, { eventType: 'test.failed', payload: {} });
    await sql`UPDATE outbox_events SET status = 'failed', attempts = 10 WHERE id = ${failed.id}`.execute(db);
    expect((await outbox.countByStatus(db)).failed).toBeGreaterThanOrEqual(1);
    expect(await outbox.requeueFailed(db, failed.id)).toBe(true);
    expect(await outbox.requeueFailed(db, failed.id)).toBe(false);
    const row = await db
      .selectFrom('outbox_events')
      .select(['status', 'attempts'])
      .where('id', '=', failed.id)
      .executeTakeFirstOrThrow();
    expect(row).toEqual({ status: 'pending', attempts: 0 });
  });
});

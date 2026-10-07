import { randomUUID } from 'node:crypto';
import { sql, type Kysely } from 'kysely';
import { Money } from '@erp-platform/shared-kernel';
import type { TenantDatabase } from '../../src/database/tenant/kysely-client';
import { StockMovementsService } from '../../src/modules/inventory/application/services/stock-movements.service';
import { InventoryValuationEventsService } from '../../src/modules/inventory/application/services/inventory-valuation-events.service';
import { StockCountsService } from '../../src/modules/inventory/application/services/stock-counts.service';
import { InventoryReportsService } from '../../src/modules/inventory/application/services/inventory-reports.service';
import { UnitsOfMeasureService } from '../../src/modules/inventory/application/services/units-of-measure.service';
import { KyselyStockLevelRepository } from '../../src/modules/inventory/infrastructure/persistence/kysely-stock-level.repository';
import { KyselyStockMovementRepository } from '../../src/modules/inventory/infrastructure/persistence/kysely-stock-movement.repository';
import { KyselyWarehouseLocationRepository } from '../../src/modules/inventory/infrastructure/persistence/kysely-warehouse-location.repository';
import { KyselyProductVariantRepository } from '../../src/modules/inventory/infrastructure/persistence/kysely-product-variant.repository';
import { KyselyProductRepository } from '../../src/modules/inventory/infrastructure/persistence/kysely-product.repository';
import { KyselyStockLotRepository } from '../../src/modules/inventory/infrastructure/persistence/kysely-stock-lot.repository';
import { KyselyUnitOfMeasureRepository } from '../../src/modules/inventory/infrastructure/persistence/kysely-unit-of-measure.repository';
import { KyselyStockCountRepository } from '../../src/modules/inventory/infrastructure/persistence/kysely-stock-count.repository';
import { KyselyInventoryReportsRepository } from '../../src/modules/inventory/infrastructure/persistence/kysely-inventory-reports.repository';
import { NumberingSequencesService } from '../../src/modules/settings/application/services/numbering-sequences.service';
import { KyselyNumberingSequenceRepository } from '../../src/modules/settings/infrastructure/persistence/kysely-numbering-sequence.repository';
import { OutboxWriterService } from '../../src/shared/outbox/application/services/outbox-writer.service';
import { KyselyOutboxEventRepository } from '../../src/shared/outbox/infrastructure/persistence/kysely-outbox-event.repository';
import { openIntegrationDb, uniqueSuffix } from './tenant-db';

/** Opening balances, stocktakes and the inventory reports (item card, valuation, low stock). */
describe('Stock counts & inventory reports (integration, real Postgres)', () => {
  let db: Kysely<TenantDatabase>;
  let stock: StockMovementsService;
  let counts: StockCountsService;
  let reports: InventoryReportsService;
  let warehouseId: string;
  let locationId: string;
  const egp = (minor: bigint) => Money.fromMinorUnits(minor, 'EGP');

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
        code: `C-${suffix}`,
        name: `Count product ${suffix}`,
        unit_of_measure_id: unitId,
        tracking_type: trackingType,
        is_active: true,
        track_variants: false,
      })
      .execute();
    const variantId = randomUUID();
    await db
      .insertInto('product_variants')
      .values({ id: variantId, product_id: productId, sku: `CS-${suffix}`, is_active: true })
      .execute();
    return variantId;
  }

  async function onHand(variantId: string): Promise<number> {
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
    const lots = new KyselyStockLotRepository();
    const locations = new KyselyWarehouseLocationRepository();
    stock = new StockMovementsService(
      new KyselyStockLevelRepository(),
      new KyselyStockMovementRepository(),
      locations,
      new KyselyProductVariantRepository(),
      new KyselyProductRepository(),
      lots,
      new UnitsOfMeasureService(new KyselyUnitOfMeasureRepository()),
    );
    counts = new StockCountsService(
      new KyselyStockCountRepository(),
      lots,
      locations,
      new KyselyProductVariantRepository(),
      new KyselyProductRepository(),
      stock,
      new NumberingSequencesService(new KyselyNumberingSequenceRepository()),
      new OutboxWriterService(new KyselyOutboxEventRepository()),
      new InventoryValuationEventsService(new OutboxWriterService(new KyselyOutboxEventRepository())),
    );
    reports = new InventoryReportsService(new KyselyInventoryReportsRepository());
    const suffix = uniqueSuffix();
    warehouseId = randomUUID();
    locationId = randomUUID();
    await db
      .insertInto('warehouses')
      .values({ id: warehouseId, name: `Count WH ${suffix}`, code: `CW-${suffix}`, is_active: true })
      .execute();
    await db
      .insertInto('warehouse_locations')
      .values({ id: locationId, warehouse_id: warehouseId, code: 'DEFAULT', name: 'Default', is_active: true })
      .execute();
  });

  afterAll(async () => {
    await db.destroy();
  });

  it('posts an opening balance (with lots), numbers it on demand, and writes the valuation event', async () => {
    const plain = await createProduct();
    const lotted = await createProduct('lot');
    const opening = await counts.create(db, { kind: 'opening', warehouseId }, null);
    expect(opening.countNumber).toMatch(/^OPN-\d{5}$/);

    await expect(
      counts.upsertLines(db, opening.id, [{ productVariantId: lotted, countedQuantity: 5 }]),
    ).rejects.toMatchObject({ code: 'STOCK_COUNT.LOT_REQUIRED' });

    await counts.upsertLines(db, opening.id, [
      { productVariantId: plain, countedQuantity: 10, unitCost: egp(2500n) },
      {
        productVariantId: lotted,
        lotNumber: 'L-1',
        expiryDate: '2030-01-31',
        countedQuantity: 4,
        unitCost: egp(1000n),
      },
    ]);
    // Re-sending a line updates it instead of duplicating it.
    const updated = await counts.upsertLines(db, opening.id, [
      { productVariantId: plain, countedQuantity: 12, unitCost: egp(2500n) },
    ]);
    expect(updated.lines).toHaveLength(2);

    const { count, changes } = await counts.post(db, opening.id, 'test', null);
    expect(count.status).toBe('posted');
    expect(changes).toHaveLength(2);
    expect(await onHand(plain)).toBe(12);
    expect(await onHand(lotted)).toBe(4);

    const event = await db
      .selectFrom('outbox_events')
      .select('payload')
      .where('event_type', '=', 'inventory.stock_count.posted')
      .where(sql`payload->>'entityId'`, '=', opening.id)
      .executeTakeFirstOrThrow();
    const metadata = (event.payload as { metadata: { totalIncrease: { amountMinorUnits: string } } }).metadata;
    expect(metadata.totalIncrease.amountMinorUnits).toBe(String(12 * 2500 + 4 * 1000));

    await expect(counts.post(db, opening.id, 'test', null)).rejects.toMatchObject({ code: 'STOCK_COUNT.NOT_DRAFT' });
  });

  it('a stocktake can load one location only (cycle count shelf by shelf)', async () => {
    const shelfId = randomUUID();
    await db
      .insertInto('warehouse_locations')
      .values({ id: shelfId, warehouse_id: warehouseId, code: `SHELF-${shelfId.slice(0, 6)}`, name: 'Shelf', is_active: true })
      .execute();
    const onShelf = await createProduct();
    const elsewhere = await createProduct();
    await stock.recordMovement(db, {
      productVariantId: onShelf,
      locationId: shelfId,
      movementType: 'in',
      quantity: 4,
      unitCost: egp(1000n),
    });
    await stock.recordMovement(db, {
      productVariantId: elsewhere,
      locationId,
      movementType: 'in',
      quantity: 9,
      unitCost: egp(1000n),
    });
    const take = await counts.create(db, { kind: 'stocktake', warehouseId }, null);
    const loaded = await counts.loadStock(db, take.id, { locationIds: [shelfId] });
    expect(loaded.lines.map((line) => [line.productVariantId, line.locationId, line.systemQuantity])).toEqual([
      [onShelf, shelfId, 4],
    ]);
    await expect(counts.loadStock(db, take.id, { locationIds: [randomUUID()] })).rejects.toMatchObject({
      code: 'STOCK_COUNT.LOCATION_NOT_IN_WAREHOUSE',
    });
    await counts.cancel(db, take.id);
  });

  it('a stocktake sets on-hand to the counted quantity against the live stock, skipping uncounted lines', async () => {
    const a = await createProduct();
    const b = await createProduct();
    const c = await createProduct();
    for (const [variant, qty] of [
      [a, 10],
      [b, 5],
      [c, 7],
    ] as const) {
      await stock.recordMovement(db, {
        productVariantId: variant,
        locationId,
        movementType: 'in',
        quantity: qty,
        unitCost: egp(1000n),
      });
    }
    const take = await counts.create(db, { kind: 'stocktake', warehouseId }, null);
    const loaded = await counts.loadStock(db, take.id, {});
    const lineOf = (variant: string) => loaded.lines.find((line) => line.productVariantId === variant)!;
    expect(lineOf(a).systemQuantity).toBe(10);

    await counts.upsertLines(db, take.id, [
      { productVariantId: a, countedQuantity: 8 },
      { productVariantId: b, countedQuantity: 6 },
    ]);
    // A sale while counting: posting uses the live quantity, so on-hand still ends at the count.
    await stock.recordMovement(db, { productVariantId: a, locationId, movementType: 'out', quantity: 1 });

    await counts.post(db, take.id, 'test', null);
    expect(await onHand(a)).toBe(8);
    expect(await onHand(b)).toBe(6);
    expect(await onHand(c)).toBe(7);
  });

  it('counts tracked stock per lot (a short lot is reduced, a newly found lot is added)', async () => {
    const variant = await createProduct('lot');
    await stock.recordMovement(db, {
      productVariantId: variant,
      locationId,
      movementType: 'in',
      quantity: 5,
      unitCost: egp(1000n),
      lotNumber: 'A',
    });
    const take = await counts.create(db, { kind: 'stocktake', warehouseId }, null);
    await counts.loadStock(db, take.id, {});
    await counts.upsertLines(db, take.id, [
      { productVariantId: variant, lotNumber: 'A', countedQuantity: 3 },
      { productVariantId: variant, lotNumber: 'B', countedQuantity: 2, unitCost: egp(1200n) },
    ]);
    await counts.post(db, take.id, 'test', null);
    const lots = await db
      .selectFrom('stock_lot_levels')
      .innerJoin('stock_lots', 'stock_lots.id', 'stock_lot_levels.stock_lot_id')
      .select(['stock_lots.lot_number as lot', 'stock_lot_levels.quantity_on_hand as qty'])
      .where('stock_lots.product_variant_id', '=', variant)
      .execute();
    expect(Object.fromEntries(lots.map((row) => [row.lot, Number(row.qty)]))).toEqual({ A: 3, B: 2 });
    expect(await onHand(variant)).toBe(5);
  });

  it('item card: opening balance, running balance and document numbers', async () => {
    const variant = await createProduct();
    const opening = await counts.create(db, { kind: 'opening', warehouseId }, null);
    await counts.upsertLines(db, opening.id, [{ productVariantId: variant, countedQuantity: 20, unitCost: egp(500n) }]);
    await counts.post(db, opening.id, 'test', null);
    await stock.recordMovement(db, { productVariantId: variant, locationId, movementType: 'out', quantity: 3 });
    await stock.recordMovement(db, { productVariantId: variant, locationId, movementType: 'out', quantity: 2 });

    const card = await reports.itemCard(db, variant, { warehouseId });
    expect(card.movements.map((row) => row.balance)).toEqual([20, 17, 15]);
    expect(card.movements[0]!.referenceNumber).toBe(opening.countNumber);
    expect(card).toMatchObject({ openingQuantity: 0, closingQuantity: 15, totalIn: 20, totalOut: 5 });

    const tomorrow = new Date(Date.now() + 86_400_000);
    const later = await reports.itemCard(db, variant, { warehouseId, from: tomorrow });
    expect(later).toMatchObject({ openingQuantity: 15, closingQuantity: 15, movements: [] });
  });

  it('valuation sums quantity × average cost; low stock lists levels at or under the reorder point', async () => {
    const variant = await createProduct();
    await stock.recordMovement(db, {
      productVariantId: variant,
      locationId,
      movementType: 'in',
      quantity: 4,
      unitCost: egp(1000n),
    });
    await stock.recordMovement(db, {
      productVariantId: variant,
      locationId,
      movementType: 'in',
      quantity: 6,
      unitCost: egp(2000n),
    });
    const row = (await reports.valuation(db, warehouseId)).find((r) => r.productVariantId === variant)!;
    expect(row.quantity).toBe(10);
    expect(row.valueMinorUnits).toBe('16000');

    const level = await db
      .selectFrom('stock_levels')
      .select('id')
      .where('product_variant_id', '=', variant)
      .executeTakeFirstOrThrow();
    await stock.setReorderPoint(db, level.id, 12);
    const low = await reports.lowStock(db, warehouseId);
    expect(low.find((r) => r.productVariantId === variant)).toMatchObject({ quantity: 10, reorderPoint: 12 });
  });
});

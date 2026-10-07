import { randomUUID } from 'node:crypto';
import { sql, type Kysely } from 'kysely';
import { Money } from '@erp-platform/shared-kernel';
import type { TenantDatabase } from '../../src/database/tenant/kysely-client';
import { StockMovementsService } from '../../src/modules/inventory/application/services/stock-movements.service';
import { StockTransfersService } from '../../src/modules/inventory/application/services/stock-transfers.service';
import { StockAdjustmentsService } from '../../src/modules/inventory/application/services/stock-adjustments.service';
import { InventoryValuationEventsService } from '../../src/modules/inventory/application/services/inventory-valuation-events.service';
import { UnitsOfMeasureService } from '../../src/modules/inventory/application/services/units-of-measure.service';
import { KyselyStockLevelRepository } from '../../src/modules/inventory/infrastructure/persistence/kysely-stock-level.repository';
import { KyselyStockMovementRepository } from '../../src/modules/inventory/infrastructure/persistence/kysely-stock-movement.repository';
import { KyselyWarehouseLocationRepository } from '../../src/modules/inventory/infrastructure/persistence/kysely-warehouse-location.repository';
import { KyselyWarehouseRepository } from '../../src/modules/inventory/infrastructure/persistence/kysely-warehouse.repository';
import { KyselyProductVariantRepository } from '../../src/modules/inventory/infrastructure/persistence/kysely-product-variant.repository';
import { KyselyProductRepository } from '../../src/modules/inventory/infrastructure/persistence/kysely-product.repository';
import { KyselyStockLotRepository } from '../../src/modules/inventory/infrastructure/persistence/kysely-stock-lot.repository';
import { KyselyUnitOfMeasureRepository } from '../../src/modules/inventory/infrastructure/persistence/kysely-unit-of-measure.repository';
import { KyselyStockTransferRepository } from '../../src/modules/inventory/infrastructure/persistence/kysely-stock-transfer.repository';
import { KyselyStockAdjustmentRepository } from '../../src/modules/inventory/infrastructure/persistence/kysely-stock-adjustment.repository';
import { KyselyProductUnitRepository } from '../../src/modules/inventory/infrastructure/persistence/kysely-product-unit.repository';
import { NumberingSequencesService } from '../../src/modules/settings/application/services/numbering-sequences.service';
import { KyselyNumberingSequenceRepository } from '../../src/modules/settings/infrastructure/persistence/kysely-numbering-sequence.repository';
import { OutboxWriterService } from '../../src/shared/outbox/application/services/outbox-writer.service';
import { KyselyOutboxEventRepository } from '../../src/shared/outbox/infrastructure/persistence/kysely-outbox-event.repository';
import { ProductUnitResolver } from '../../src/shared/catalog/product-unit-resolver';
import { StockAvailabilityChecker } from '../../src/shared/catalog/stock-availability-checker';
import type { InventoryValuationPostedMetadata } from '../../src/shared/events/inventory-valuation-event';
import { InventoryReportsService } from '../../src/modules/inventory/application/services/inventory-reports.service';
import { KyselyInventoryReportsRepository } from '../../src/modules/inventory/infrastructure/persistence/kysely-inventory-reports.repository';
import { openIntegrationDb, uniqueSuffix } from './tenant-db';

/** Warehouse transfers (0083), stock adjustments (0084), their valuation events and the permission migration (0082). */
describe('Stock transfer & adjustment documents (integration, real Postgres)', () => {
  let db: Kysely<TenantDatabase>;
  let stock: StockMovementsService;
  let transfers: StockTransfersService;
  let adjustments: StockAdjustmentsService;
  const egp = (minor: bigint) => Money.fromMinorUnits(minor, 'EGP');
  const actor = { schema: 'test', userId: null };

  async function createWarehouse(): Promise<{ warehouseId: string; locationId: string }> {
    const suffix = uniqueSuffix();
    const warehouseId = randomUUID();
    const locationId = randomUUID();
    await db
      .insertInto('warehouses')
      .values({ id: warehouseId, name: `Doc WH ${suffix}`, code: `DW-${suffix}`, is_active: true })
      .execute();
    await db
      .insertInto('warehouse_locations')
      .values({ id: locationId, warehouse_id: warehouseId, code: 'DEFAULT', name: 'Default', is_active: true })
      .execute();
    return { warehouseId, locationId };
  }

  async function createProduct(
    trackingType: 'none' | 'lot' | 'serial' = 'none',
    carton?: number,
  ): Promise<{ variantId: string; cartonUnitId: string | null }> {
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
        code: `D-${suffix}`,
        name: `Doc product ${suffix}`,
        unit_of_measure_id: unitId,
        tracking_type: trackingType,
        is_active: true,
        track_variants: false,
      })
      .execute();
    const variantId = randomUUID();
    await db
      .insertInto('product_variants')
      .values({ id: variantId, product_id: productId, sku: `DS-${suffix}`, is_active: true })
      .execute();
    let cartonUnitId: string | null = null;
    if (carton) {
      cartonUnitId = randomUUID();
      await db
        .insertInto('units_of_measure')
        .values({
          id: cartonUnitId,
          name: `ctn-${suffix}`,
          symbol: `ctn${suffix}`,
          is_active: true,
          conversion_factor: '1',
        })
        .execute();
      await db
        .insertInto('product_units')
        .values({ id: randomUUID(), product_id: productId, unit_of_measure_id: cartonUnitId, factor: String(carton) })
        .execute();
    }
    return { variantId, cartonUnitId };
  }

  async function onHand(variantId: string, locationId: string): Promise<{ quantity: number; value: bigint }> {
    const row = await db
      .selectFrom('stock_levels')
      .select(['quantity_on_hand', 'inventory_value_amount'])
      .where('product_variant_id', '=', variantId)
      .where('location_id', '=', locationId)
      .executeTakeFirst();
    return row
      ? { quantity: Number(row.quantity_on_hand), value: BigInt(row.inventory_value_amount ?? '0') }
      : { quantity: 0, value: 0n };
  }

  async function valuationEvent(sourceId: string): Promise<InventoryValuationPostedMetadata | null> {
    const row = await db
      .selectFrom('outbox_events')
      .select('payload')
      .where('event_type', '=', 'inventory.valuation.posted')
      .where(sql`payload->>'entityId'`, '=', sourceId)
      .executeTakeFirst();
    return row ? (row.payload as { metadata: InventoryValuationPostedMetadata }).metadata : null;
  }

  beforeAll(async () => {
    db = openIntegrationDb();
    const lots = new KyselyStockLotRepository();
    const locations = new KyselyWarehouseLocationRepository();
    const productUnits = new KyselyProductUnitRepository();
    stock = new StockMovementsService(
      new KyselyStockLevelRepository(),
      new KyselyStockMovementRepository(),
      locations,
      new KyselyProductVariantRepository(),
      new KyselyProductRepository(),
      lots,
      new UnitsOfMeasureService(new KyselyUnitOfMeasureRepository()),
      productUnits,
    );
    const numbering = new NumberingSequencesService(new KyselyNumberingSequenceRepository());
    const valuation = new InventoryValuationEventsService(new OutboxWriterService(new KyselyOutboxEventRepository()));
    transfers = new StockTransfersService(
      new KyselyStockTransferRepository(),
      new KyselyWarehouseRepository(),
      locations,
      stock,
      numbering,
      new ProductUnitResolver(),
      new StockAvailabilityChecker(),
      valuation,
    );
    adjustments = new StockAdjustmentsService(
      new KyselyStockAdjustmentRepository(),
      new KyselyWarehouseRepository(),
      locations,
      new KyselyProductVariantRepository(),
      new KyselyProductRepository(),
      lots,
      stock,
      numbering,
      new ProductUnitResolver(),
      valuation,
    );
  });

  afterAll(async () => {
    await db.destroy();
  });

  it('two-step transfer in cartons: stock leaves at dispatch, arrives at the exact value, shortage is written off', async () => {
    const source = await createWarehouse();
    const target = await createWarehouse();
    const { variantId, cartonUnitId } = await createProduct('none', 12);
    // 30 pieces worth 100.00 → average 3.3333…
    await stock.recordMovement(db, {
      productVariantId: variantId,
      locationId: source.locationId,
      movementType: 'in',
      quantity: 30,
      unitCost: egp(333n),
      totalCost: egp(10000n),
    });

    const draft = await transfers.create(
      db,
      {
        fromWarehouseId: source.warehouseId,
        toWarehouseId: target.warehouseId,
        lines: [{ productVariantId: variantId, quantity: 2, unitOfMeasureId: cartonUnitId }],
      },
      null,
    );
    expect(draft.transferNumber).toMatch(/^TRF-\d{5}$/);
    expect(draft.lines[0]).toMatchObject({ quantity: 2, unitFactor: 12 });

    const inTransit = await transfers.dispatch(db, draft.id, actor);
    expect(inTransit.status).toBe('in_transit');
    expect(await onHand(variantId, source.locationId)).toEqual({ quantity: 6, value: 2000n });
    expect(await onHand(variantId, target.locationId)).toEqual({ quantity: 0, value: 0n });
    expect(inTransit.lines[0]!.dispatchedValue?.toMinorUnits()).toBe(8000n);

    const inTransitValue = await transfers.inTransitValue(db);
    expect(inTransitValue.find((row) => row.toWarehouseId === target.warehouseId)?.valueMinorUnits).toBe('8000');

    // Double dispatch is refused.
    await expect(transfers.dispatch(db, draft.id, actor)).rejects.toMatchObject({ code: 'STOCK_TRANSFER.WRONG_STATUS' });

    // 23 of 24 pieces arrive.
    const received = await transfers.receive(
      db,
      draft.id,
      { lines: [{ lineId: draft.lines[0]!.id, receivedQuantity: 23 }] },
      actor,
    );
    expect(received.status).toBe('received');
    const arrived = await onHand(variantId, target.locationId);
    expect(arrived.quantity).toBe(23);
    // 8000 × 23/24 = 7666.67 → 7667; the missing piece is 333.
    expect(arrived.value).toBe(7667n);
    const event = await valuationEvent(draft.id);
    expect(event?.sourceType).toBe('stock_transfer');
    expect(event?.entries).toEqual([
      { kind: 'adjustment_loss', amount: { amountMinorUnits: '333', currency: 'EGP' }, counterAccountId: null },
    ]);
  });

  it('one-step post moves a lot-tracked item lot by lot; insufficient stock lists the item', async () => {
    const source = await createWarehouse();
    const target = await createWarehouse();
    const { variantId } = await createProduct('lot');
    await stock.recordMovement(db, {
      productVariantId: variantId,
      locationId: source.locationId,
      movementType: 'in',
      quantity: 5,
      unitCost: egp(1000n),
      lotNumber: 'A',
      expiryDate: new Date('2031-01-01T00:00:00'),
    });
    await stock.recordMovement(db, {
      productVariantId: variantId,
      locationId: source.locationId,
      movementType: 'in',
      quantity: 5,
      unitCost: egp(1000n),
      lotNumber: 'B',
      expiryDate: new Date('2032-01-01T00:00:00'),
    });

    const tooMuch = await transfers.create(
      db,
      {
        fromWarehouseId: source.warehouseId,
        toWarehouseId: target.warehouseId,
        lines: [{ productVariantId: variantId, quantity: 11 }],
      },
      null,
    );
    await expect(transfers.post(db, tooMuch.id, actor)).rejects.toMatchObject({
      code: 'STOCK_TRANSFER.INSUFFICIENT_STOCK',
    });
    expect((await transfers.getById(db, tooMuch.id)).status).toBe('draft');

    const ok = await transfers.create(
      db,
      {
        fromWarehouseId: source.warehouseId,
        toWarehouseId: target.warehouseId,
        lines: [{ productVariantId: variantId, quantity: 7 }],
      },
      null,
    );
    const done = await transfers.post(db, ok.id, actor);
    expect(done.status).toBe('received');
    // FEFO: all of lot A (earliest expiry), 2 of lot B.
    expect(done.lines[0]!.dispatched.map((piece) => piece.quantity)).toEqual([5, 2]);
    const lotLevels = await db
      .selectFrom('stock_lot_levels')
      .innerJoin('stock_lots', 'stock_lots.id', 'stock_lot_levels.stock_lot_id')
      .select(['stock_lots.lot_number', 'stock_lot_levels.quantity_on_hand'])
      .where('stock_lot_levels.location_id', '=', target.locationId)
      .orderBy('stock_lots.lot_number')
      .execute();
    expect(lotLevels.map((row) => [row.lot_number, Number(row.quantity_on_hand)])).toEqual([
      ['A', 5],
      ['B', 2],
    ]);
    expect(await valuationEvent(ok.id)).toBeNull(); // nothing lost on the way → no journal entry
  });

  it('cancelling a transfer in transit puts the goods back at the source at the same value', async () => {
    const source = await createWarehouse();
    const target = await createWarehouse();
    const { variantId } = await createProduct();
    await stock.recordMovement(db, {
      productVariantId: variantId,
      locationId: source.locationId,
      movementType: 'in',
      quantity: 10,
      unitCost: egp(500n),
    });
    const draft = await transfers.create(
      db,
      {
        fromWarehouseId: source.warehouseId,
        toWarehouseId: target.warehouseId,
        lines: [{ productVariantId: variantId, quantity: 4 }],
      },
      null,
    );
    await transfers.dispatch(db, draft.id, actor);
    expect((await onHand(variantId, source.locationId)).quantity).toBe(6);
    const cancelled = await transfers.cancel(db, draft.id, actor);
    expect(cancelled.status).toBe('cancelled');
    expect(await onHand(variantId, source.locationId)).toEqual({ quantity: 10, value: 5000n });
  });

  it('a stock adjustment posts gains and losses with the reason account and refuses a wrong-direction reason', async () => {
    const { warehouseId, locationId } = await createWarehouse();
    const { variantId } = await createProduct();
    await stock.recordMovement(db, {
      productVariantId: variantId,
      locationId,
      movementType: 'in',
      quantity: 10,
      unitCost: egp(1000n),
    });
    const reasons = await adjustments.listReasons(db);
    const damaged = reasons.find((reason) => reason.name === 'تالف / هالك')!;
    expect(damaged.direction).toBe('decrease');

    const accountId = (await db
      .selectFrom('chart_of_accounts')
      .select('id')
      .where('code', '=', '529')
      .executeTakeFirstOrThrow()).id;
    const custom = await adjustments.createReason(db, { name: `هدايا ${uniqueSuffix()}`, direction: 'decrease', accountId });

    const wrong = await adjustments.create(
      db,
      {
        warehouseId,
        reasonId: damaged.id,
        lines: [{ productVariantId: variantId, direction: 'increase', quantity: 1, unitCost: egp(1000n) }],
      },
      null,
    );
    await expect(adjustments.post(db, wrong.id, actor)).rejects.toMatchObject({
      code: 'STOCK_ADJUSTMENT.REASON_DIRECTION',
    });

    const posted = await adjustments.createAndPost(
      db,
      {
        warehouseId,
        reasonId: damaged.id,
        lines: [
          { productVariantId: variantId, direction: 'decrease', quantity: 2 },
          { productVariantId: variantId, direction: 'decrease', quantity: 1, reasonId: custom.id },
        ],
      },
      actor,
    );
    expect(posted.adjustmentNumber).toMatch(/^ADJ-\d{5}$/);
    expect(posted.status).toBe('posted');
    expect(posted.lines.map((line) => line.postedValue?.toMinorUnits())).toEqual([2000n, 1000n]);
    expect((await onHand(variantId, locationId)).quantity).toBe(7);

    const event = await valuationEvent(posted.id);
    expect(event?.entries).toEqual([
      { kind: 'adjustment_loss', amount: { amountMinorUnits: '2000', currency: 'EGP' }, counterAccountId: null },
      { kind: 'adjustment_loss', amount: { amountMinorUnits: '1000', currency: 'EGP' }, counterAccountId: accountId },
    ]);

    // The reason is in use now → deleting deactivates it.
    expect(await adjustments.deleteReason(db, custom.id)).toEqual({ deleted: false });
  });

  it('the quick movement dialog is a posted adjustment with a number and a valuation event', async () => {
    const { locationId } = await createWarehouse();
    const { variantId } = await createProduct();
    const { adjustment, movement } = await adjustments.quick(
      db,
      { productVariantId: variantId, locationId, movementType: 'adjustment_increase', quantity: 3, unitCost: egp(700n) },
      actor,
    );
    expect(adjustment.status).toBe('posted');
    expect(movement.referenceType).toBe('stock_adjustment');
    expect(movement.referenceId).toBe(adjustment.id);
    const event = await valuationEvent(adjustment.id);
    expect(event?.entries[0]).toMatchObject({ kind: 'adjustment_gain', amount: { amountMinorUnits: '2100' } });
  });

  it('valuation as of a date is rebuilt from movements and matches the live value; in-transit counts until received', async () => {
    const source = await createWarehouse();
    const target = await createWarehouse();
    const { variantId } = await createProduct();
    await stock.recordMovement(db, {
      productVariantId: variantId,
      locationId: source.locationId,
      movementType: 'in',
      quantity: 9,
      unitCost: egp(111n),
      totalCost: egp(1000n),
    });
    await adjustments.quick(
      db,
      { productVariantId: variantId, locationId: source.locationId, movementType: 'adjustment_decrease', quantity: 2 },
      actor,
    );
    const reports = new InventoryReportsService(new KyselyInventoryReportsRepository());
    const tomorrow = new Date(Date.now() + 86_400_000);
    const yesterday = new Date(Date.now() - 86_400_000);
    const live = (await reports.valuation(db, source.warehouseId)).find((row) => row.productVariantId === variantId)!;
    const rebuilt = (await reports.valuation(db, source.warehouseId, tomorrow)).find(
      (row) => row.productVariantId === variantId,
    )!;
    expect(rebuilt.quantity).toBe(live.quantity);
    expect(rebuilt.valueMinorUnits).toBe(live.valueMinorUnits);
    expect(
      (await reports.valuation(db, source.warehouseId, yesterday)).some((row) => row.productVariantId === variantId),
    ).toBe(false);

    const before = BigInt((await reports.valuationSummary(db, null, null)).inTransitValue);
    const transfer = await transfers.create(
      db,
      {
        fromWarehouseId: source.warehouseId,
        toWarehouseId: target.warehouseId,
        lines: [{ productVariantId: variantId, quantity: 7 }],
      },
      null,
    );
    await transfers.dispatch(db, transfer.id, actor);
    const during = await reports.valuationSummary(db, null, null);
    expect(BigInt(during.inTransitValue) - before).toBe(BigInt(live.valueMinorUnits));
    await transfers.receive(db, transfer.id, {}, actor);
    expect(BigInt((await reports.valuationSummary(db, null, null)).inTransitValue)).toBe(before);
  });

  it('migration 0082 replaced inventory.manage with granular permissions, all granted to Owner', async () => {
    const keys = (await db.selectFrom('permissions').select('key').where('key', 'like', 'inventory.%').execute()).map(
      (row) => row.key,
    );
    expect(keys).not.toContain('inventory.manage');
    expect(keys).toEqual(expect.arrayContaining(['inventory.products.view', 'inventory.costs.view', 'inventory.counts.post']));
    const ownerKeys = (
      await db
        .selectFrom('role_permissions')
        .innerJoin('permissions', 'permissions.id', 'role_permissions.permission_id')
        .select('permissions.key')
        .where('role_permissions.role_id', '=', '00000000-0000-0000-0000-000000000001')
        .where('permissions.key', 'like', 'inventory.%')
        .execute()
    ).map((row) => row.key);
    expect(ownerKeys.sort()).toEqual(keys.sort());

    const settings = await db
      .selectFrom('accounting_settings')
      .select(['grni_account_id', 'inventory_adjustment_account_id', 'opening_balance_equity_account_id'])
      .executeTakeFirst();
    // The settings row may not exist yet in a fresh schema (created on first read) — the codes must.
    const codes = await db.selectFrom('chart_of_accounts').select('code').where('code', 'in', ['217', '35', '54']).execute();
    expect(codes).toHaveLength(3);
    if (settings) expect(settings.grni_account_id).not.toBeNull();
  });
});

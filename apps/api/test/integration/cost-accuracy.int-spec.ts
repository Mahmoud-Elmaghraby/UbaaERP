import { randomUUID } from 'node:crypto';
import { sql, type Kysely } from 'kysely';
import { Money } from '@erp-platform/shared-kernel';
import type { TenantDatabase } from '../../src/database/tenant/kysely-client';
import { LandedCostsService } from '../../src/modules/inventory/application/services/landed-costs.service';
import { StockMovementsService } from '../../src/modules/inventory/application/services/stock-movements.service';
import { UnitsOfMeasureService } from '../../src/modules/inventory/application/services/units-of-measure.service';
import { KyselyLandedCostRepository } from '../../src/modules/inventory/infrastructure/persistence/kysely-landed-cost.repository';
import { KyselyProductRepository } from '../../src/modules/inventory/infrastructure/persistence/kysely-product.repository';
import { KyselyProductVariantRepository } from '../../src/modules/inventory/infrastructure/persistence/kysely-product-variant.repository';
import { KyselyStockLevelRepository } from '../../src/modules/inventory/infrastructure/persistence/kysely-stock-level.repository';
import { KyselyStockLotRepository } from '../../src/modules/inventory/infrastructure/persistence/kysely-stock-lot.repository';
import { KyselyStockMovementRepository } from '../../src/modules/inventory/infrastructure/persistence/kysely-stock-movement.repository';
import { KyselyUnitOfMeasureRepository } from '../../src/modules/inventory/infrastructure/persistence/kysely-unit-of-measure.repository';
import { KyselyWarehouseLocationRepository } from '../../src/modules/inventory/infrastructure/persistence/kysely-warehouse-location.repository';
import { GoodsReceiptsService } from '../../src/modules/purchases/application/services/goods-receipts.service';
import { KyselyGoodsReceiptRepository } from '../../src/modules/purchases/infrastructure/persistence/kysely-goods-receipt.repository';
import { KyselyGoodsReceiptLineRepository } from '../../src/modules/purchases/infrastructure/persistence/kysely-goods-receipt-line.repository';
import { KyselyPurchaseOrderRepository } from '../../src/modules/purchases/infrastructure/persistence/kysely-purchase-order.repository';
import { KyselyPurchaseOrderLineRepository } from '../../src/modules/purchases/infrastructure/persistence/kysely-purchase-order-line.repository';
import { KyselyProductTrackingReader } from '../../src/modules/purchases/infrastructure/persistence/kysely-product-tracking.reader';
import { NumberingSequencesService } from '../../src/modules/settings/application/services/numbering-sequences.service';
import { KyselyNumberingSequenceRepository } from '../../src/modules/settings/infrastructure/persistence/kysely-numbering-sequence.repository';
import { OutboxWriterService } from '../../src/shared/outbox/application/services/outbox-writer.service';
import { KyselyOutboxEventRepository } from '../../src/shared/outbox/infrastructure/persistence/kysely-outbox-event.repository';
import { openIntegrationDb, uniqueSuffix } from './tenant-db';

const egp = (minor: number | bigint) => Money.fromMinorUnits(BigInt(minor), 'EGP');

/** Cost accuracy (migration 0081): value-based average, original-cost returns, FX receipts, landed cost split. */
describe('Inventory cost accuracy (integration, real Postgres)', () => {
  let db: Kysely<TenantDatabase>;
  let stock: StockMovementsService;
  let goodsReceipts: GoodsReceiptsService;
  let landedCosts: LandedCostsService;
  let levels: KyselyStockLevelRepository;
  let warehouseId: string;
  let locationId: string;
  let unitId: string;

  async function createVariant(): Promise<string> {
    const suffix = uniqueSuffix();
    const productId = randomUUID();
    await db
      .insertInto('products')
      .values({
        id: productId,
        code: `C-${suffix}`,
        name: `Cost ${suffix}`,
        unit_of_measure_id: unitId,
        tracking_type: 'none',
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

  const receive = (variantId: string, quantity: number, unitCost: Money, totalCost?: Money) =>
    stock.recordMovement(db, {
      productVariantId: variantId,
      locationId,
      movementType: 'in',
      quantity,
      unitCost,
      totalCost,
    });

  const issue = (variantId: string, quantity: number, referenceId?: string) =>
    stock.recordMovement(db, {
      productVariantId: variantId,
      locationId,
      movementType: 'out',
      quantity,
      referenceType: referenceId ? 'delivery' : undefined,
      referenceId,
    });

  async function foreignOrder(variantId: string, currency: string, unitPriceMinor: number, quantity: number) {
    const suffix = uniqueSuffix();
    const supplierId = randomUUID();
    await db
      .insertInto('suppliers')
      .values({
        id: supplierId,
        name: `FX ${suffix}`,
        code: `FX-${suffix}`,
        default_currency: currency,
        is_active: true,
        custom_fields: '{}',
      })
      .execute();
    const poId = randomUUID();
    await db
      .insertInto('purchase_orders')
      .values({
        id: poId,
        po_number: `PO-FX-${suffix}`,
        supplier_id: supplierId,
        status: 'confirmed',
        custom_fields: '{}',
      })
      .execute();
    const lineId = randomUUID();
    await db
      .insertInto('purchase_order_lines')
      .values({
        id: lineId,
        purchase_order_id: poId,
        product_variant_id: variantId,
        quantity: String(quantity),
        unit_price_amount: String(unitPriceMinor),
        unit_price_currency: currency,
      })
      .execute();
    return { poId, lineId };
  }

  async function receiptEventLine(receiptId: string) {
    const event = await db
      .selectFrom('outbox_events')
      .select('payload')
      .where('event_type', '=', 'purchases.goods_receipt.confirmed')
      .where(sql`payload->>'entityId'`, '=', receiptId)
      .executeTakeFirstOrThrow();
    type Line = {
      quantity: number;
      unitCost: { amountMinorUnits: string; currency: string };
      totalCost: { amountMinorUnits: string; currency: string };
    };
    return (event.payload as { metadata: { lines: Line[] } }).metadata.lines[0]!;
  }

  beforeAll(async () => {
    db = openIntegrationDb();
    levels = new KyselyStockLevelRepository();
    const movements = new KyselyStockMovementRepository();
    const outbox = new OutboxWriterService(new KyselyOutboxEventRepository());
    stock = new StockMovementsService(
      levels,
      movements,
      new KyselyWarehouseLocationRepository(),
      new KyselyProductVariantRepository(),
      new KyselyProductRepository(),
      new KyselyStockLotRepository(),
      new UnitsOfMeasureService(new KyselyUnitOfMeasureRepository()),
    );
    landedCosts = new LandedCostsService(new KyselyLandedCostRepository(), movements, levels, outbox);
    const numbering = new NumberingSequencesService(new KyselyNumberingSequenceRepository());
    await numbering.ensureTenantWide(db, 'goods_receipt', { prefix: 'GRN-', paddingLength: 5 });
    goodsReceipts = new GoodsReceiptsService(
      new KyselyGoodsReceiptRepository(),
      new KyselyGoodsReceiptLineRepository(),
      new KyselyPurchaseOrderRepository(),
      new KyselyPurchaseOrderLineRepository(),
      numbering,
      outbox,
      new KyselyProductTrackingReader(),
    );
    const suffix = uniqueSuffix();
    unitId = randomUUID();
    await db
      .insertInto('units_of_measure')
      .values({ id: unitId, name: `g-${suffix}`, symbol: `g${suffix}`, is_active: true, conversion_factor: '1' })
      .execute();
    warehouseId = randomUUID();
    locationId = randomUUID();
    await db
      .insertInto('warehouses')
      .values({ id: warehouseId, name: `Cost WH ${suffix}`, code: `CW-${suffix}`, is_active: true })
      .execute();
    await db
      .insertInto('warehouse_locations')
      .values({ id: locationId, warehouse_id: warehouseId, code: 'DEFAULT', name: 'Default', is_active: true })
      .execute();
  });

  afterAll(async () => {
    await db.destroy();
  });

  it('keeps the exact stock value for cheap items: 3,000 g for 10.00 sells as 3.33 + 6.67', async () => {
    const variant = await createVariant();
    await receive(variant, 3000, egp(0), egp(1000)); // 0.00333/g — rounds to 0 per gram
    const first = await issue(variant, 1000);
    expect(first.totalCost?.toMinorUnits()).toBe(333n);
    const level = await levels.findByVariantAndLocation(db, variant, locationId);
    expect(level?.inventoryValue.toMinorUnits()).toBe(667n);
    const rest = await issue(variant, 2000);
    expect(rest.totalCost?.toMinorUnits()).toBe(667n); // emptying takes exactly what is left
    const empty = await levels.findByVariantAndLocation(db, variant, locationId);
    expect(empty?.inventoryValue.toMinorUnits()).toBe(0n);
  });

  it('finds the cost a delivery took, even after the average moved', async () => {
    const variant = await createVariant();
    const deliveryId = randomUUID();
    await receive(variant, 10, egp(1000));
    await issue(variant, 4, deliveryId);
    await receive(variant, 10, egp(2000)); // average is now (6×10 + 10×20) / 16 = 16.25
    expect((await stock.unitCostOfReference(db, 'delivery', deliveryId, variant))?.toMinorUnits()).toBe(1000n);
    expect(await stock.unitCostOfReference(db, 'delivery', randomUUID(), variant)).toBeNull();
  });

  it('values a USD receipt in EGP at the rate on file, or at the rate typed on the receipt', async () => {
    const variant = await createVariant();
    await db
      .insertInto('exchange_rates')
      .values({
        id: randomUUID(),
        from_currency: 'USD',
        to_currency: 'EGP',
        rate: '48.5',
        rate_date: '2001-01-10',
        source: 'manual',
      })
      .onConflict((conflict) => conflict.doNothing()) // the shared schema keeps it from a previous run
      .execute();
    const order = await foreignOrder(variant, 'USD', 1000, 10); // 10.00 USD each

    const onFile = await goodsReceipts.create(db, {
      purchaseOrderId: order.poId,
      warehouseId,
      receivedDate: '2001-01-15',
      lines: [{ purchaseOrderLineId: order.lineId, quantityReceived: 3 }],
    });
    const confirmed = await goodsReceipts.confirm(db, onFile.id, 'test', null);
    expect(confirmed.exchangeRate).toBe('48.5');
    expect(await receiptEventLine(onFile.id)).toMatchObject({
      quantity: 3,
      unitCost: { amountMinorUnits: '48500', currency: 'EGP' },
      totalCost: { amountMinorUnits: '145500', currency: 'EGP' },
    });

    const typed = await goodsReceipts.create(db, {
      purchaseOrderId: order.poId,
      warehouseId,
      receivedDate: '2001-01-15',
      exchangeRate: '50',
      lines: [{ purchaseOrderLineId: order.lineId, quantityReceived: 2 }],
    });
    await goodsReceipts.confirm(db, typed.id, 'test', null);
    expect((await receiptEventLine(typed.id)).totalCost).toEqual({ amountMinorUnits: '100000', currency: 'EGP' });
  });

  it('refuses to confirm a foreign-currency receipt with no rate, and leaves it a draft', async () => {
    const variant = await createVariant();
    const order = await foreignOrder(variant, 'JPY', 500, 5);
    const receipt = await goodsReceipts.create(db, {
      purchaseOrderId: order.poId,
      warehouseId,
      receivedDate: '1990-01-01',
      lines: [{ purchaseOrderLineId: order.lineId, quantityReceived: 1 }],
    });
    await expect(goodsReceipts.confirm(db, receipt.id, 'test', null)).rejects.toMatchObject({
      code: 'GOODS_RECEIPT.EXCHANGE_RATE_REQUIRED',
      params: { currency: 'JPY', date: '1990-01-01' },
    });
    expect((await goodsReceipts.getById(db, receipt.id)).status).toBe('draft');
  });

  it('loads a landed cost on the goods still in stock and expenses the sold share', async () => {
    const variant = await createVariant();
    const received = await receive(variant, 10, egp(1000));
    await issue(variant, 6);
    const landed = await landedCosts.apply(
      db,
      { totalCost: egp(500), allocationMethod: 'by_quantity', stockMovementIds: [received.id] },
      { schema: 'test' },
    );
    expect(landed.allocations[0]!.expensedAmount.toMinorUnits()).toBe(300n);
    const level = await levels.findByVariantAndLocation(db, variant, locationId);
    expect(level?.inventoryValue.toMinorUnits()).toBe(4200n); // 4 × 10.00 + 2.00
    expect(level?.averageCost.toMinorUnits()).toBe(1050n);
    const event = await db
      .selectFrom('outbox_events')
      .select('payload')
      .where('event_type', '=', 'inventory.landed_cost.posted')
      .where(sql`payload->>'entityId'`, '=', landed.id)
      .executeTakeFirstOrThrow();
    expect((event.payload as { metadata: unknown }).metadata).toMatchObject({
      toInventory: { amountMinorUnits: '200' },
      toCogs: { amountMinorUnits: '300' },
    });
  });
});

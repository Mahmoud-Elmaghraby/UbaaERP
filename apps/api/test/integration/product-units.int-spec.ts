import { randomUUID } from 'node:crypto';
import { sql, type Kysely } from 'kysely';
import { Money } from '@erp-platform/shared-kernel';
import type { TenantDatabase } from '../../src/database/tenant/kysely-client';
import { ProductUnitsService } from '../../src/modules/inventory/application/services/product-units.service';
import { StockMovementsService } from '../../src/modules/inventory/application/services/stock-movements.service';
import { UnitsOfMeasureService } from '../../src/modules/inventory/application/services/units-of-measure.service';
import { KyselyProductRepository } from '../../src/modules/inventory/infrastructure/persistence/kysely-product.repository';
import { KyselyProductUnitRepository } from '../../src/modules/inventory/infrastructure/persistence/kysely-product-unit.repository';
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
import { ProductUnitResolver } from '../../src/shared/catalog/product-unit-resolver';
import { OutboxWriterService } from '../../src/shared/outbox/application/services/outbox-writer.service';
import { KyselyOutboxEventRepository } from '../../src/shared/outbox/infrastructure/persistence/kysely-outbox-event.repository';
import { openIntegrationDb, uniqueSuffix } from './tenant-db';

/** Selling and buying by carton / sack (migration 0079). */
describe('Product units on documents (integration, real Postgres)', () => {
  let db: Kysely<TenantDatabase>;
  let units: ProductUnitsService;
  let resolver: ProductUnitResolver;
  let stock: StockMovementsService;
  let goodsReceipts: GoodsReceiptsService;
  let pieceId: string;
  let cartonId: string;
  let sackId: string;
  let warehouseId: string;
  let locationId: string;

  async function createUnit(name: string): Promise<string> {
    const id = randomUUID();
    const suffix = uniqueSuffix();
    await db
      .insertInto('units_of_measure')
      .values({ id, name: `${name}-${suffix}`, symbol: `${name}${suffix}`, is_active: true, conversion_factor: '1' })
      .execute();
    return id;
  }

  async function createProduct(trackingType: 'none' | 'serial' = 'none') {
    const suffix = uniqueSuffix();
    const productId = randomUUID();
    await db
      .insertInto('products')
      .values({
        id: productId,
        code: `U-${suffix}`,
        name: `Unit product ${suffix}`,
        unit_of_measure_id: pieceId,
        tracking_type: trackingType,
        is_active: true,
        track_variants: false,
      })
      .execute();
    const variantId = randomUUID();
    await db
      .insertInto('product_variants')
      .values({ id: variantId, product_id: productId, sku: `US-${suffix}`, is_active: true })
      .execute();
    return { productId, variantId };
  }

  beforeAll(async () => {
    db = openIntegrationDb();
    const productUnits = new KyselyProductUnitRepository();
    units = new ProductUnitsService(new KyselyProductRepository(), productUnits, new KyselyUnitOfMeasureRepository());
    resolver = new ProductUnitResolver();
    stock = new StockMovementsService(
      new KyselyStockLevelRepository(),
      new KyselyStockMovementRepository(),
      new KyselyWarehouseLocationRepository(),
      new KyselyProductVariantRepository(),
      new KyselyProductRepository(),
      new KyselyStockLotRepository(),
      new UnitsOfMeasureService(new KyselyUnitOfMeasureRepository()),
      productUnits,
    );
    const numbering = new NumberingSequencesService(new KyselyNumberingSequenceRepository());
    await numbering.ensureTenantWide(db, 'goods_receipt', { prefix: 'GRN-', paddingLength: 5 });
    goodsReceipts = new GoodsReceiptsService(
      new KyselyGoodsReceiptRepository(),
      new KyselyGoodsReceiptLineRepository(),
      new KyselyPurchaseOrderRepository(),
      new KyselyPurchaseOrderLineRepository(),
      numbering,
      new OutboxWriterService(new KyselyOutboxEventRepository()),
      new KyselyProductTrackingReader(),
    );
    pieceId = await createUnit('piece');
    cartonId = await createUnit('carton');
    sackId = await createUnit('sack');
    const suffix = uniqueSuffix();
    warehouseId = randomUUID();
    locationId = randomUUID();
    await db
      .insertInto('warehouses')
      .values({ id: warehouseId, name: `Units WH ${suffix}`, code: `UW-${suffix}`, is_active: true })
      .execute();
    await db
      .insertInto('warehouse_locations')
      .values({ id: locationId, warehouse_id: warehouseId, code: 'DEFAULT', name: 'Default', is_active: true })
      .execute();
  });

  afterAll(async () => {
    await db.destroy();
  });

  it('stores a product’s units and refuses the base unit, duplicates and serial items', async () => {
    const { productId } = await createProduct();
    const saved = await units.replace(db, productId, [
      { unitOfMeasureId: cartonId, factor: 12, salePrice: Money.fromMinorUnits(30000n, 'EGP'), isDefaultSale: true },
    ]);
    expect(saved).toMatchObject([{ unitOfMeasureId: cartonId, factor: 12, isDefaultSale: true }]);

    await expect(units.replace(db, productId, [{ unitOfMeasureId: pieceId, factor: 1 }])).rejects.toMatchObject({
      code: 'PRODUCT_UNIT.SAME_AS_BASE',
    });
    await expect(
      units.replace(db, productId, [
        { unitOfMeasureId: cartonId, factor: 12 },
        { unitOfMeasureId: cartonId, factor: 24 },
      ]),
    ).rejects.toMatchObject({ code: 'PRODUCT_UNIT.DUPLICATE' });
    const serial = await createProduct('serial');
    await expect(units.replace(db, serial.productId, [{ unitOfMeasureId: cartonId, factor: 2 }])).rejects.toMatchObject(
      {
        code: 'PRODUCT_UNIT.SERIAL_NOT_ALLOWED',
      },
    );
  });

  it('resolves line units: base → factor 1, own unit → its factor, unknown unit → refused', async () => {
    const { productId, variantId } = await createProduct();
    await units.replace(db, productId, [{ unitOfMeasureId: cartonId, factor: 24 }]);
    const resolved = await resolver.resolve(db, [
      { productVariantId: variantId },
      { productVariantId: variantId, unitOfMeasureId: pieceId },
      { productVariantId: variantId, unitOfMeasureId: cartonId },
      { productVariantId: variantId, unitOfMeasureId: cartonId, unitFactor: 12 },
    ]);
    expect(resolved.map((line) => [line.unitOfMeasureId, line.unitFactor])).toEqual([
      [null, 1],
      [null, 1],
      [cartonId, 24],
      [cartonId, 12],
    ]);
    await expect(
      resolver.resolve(db, [{ productVariantId: variantId, unitOfMeasureId: sackId }]),
    ).rejects.toMatchObject({ code: 'DOCUMENT.UNIT_NOT_ALLOWED' });
  });

  it('a manual movement in a product unit is stored in base units at the per-base cost', async () => {
    const { productId, variantId } = await createProduct();
    await units.replace(db, productId, [{ unitOfMeasureId: cartonId, factor: 12 }]);
    const movement = await stock.recordMovement(db, {
      productVariantId: variantId,
      locationId,
      movementType: 'in',
      quantity: 2,
      unitOfMeasureId: cartonId,
      unitCost: Money.fromMinorUnits(24000n, 'EGP'),
    });
    expect(movement.quantity).toBe(24);
    expect(movement.unitCost?.toMinorUnits()).toBe(2000n);
  });

  it('a goods receipt for a carton-priced order line tells Inventory base quantity and base cost', async () => {
    const { productId, variantId } = await createProduct();
    await units.replace(db, productId, [{ unitOfMeasureId: cartonId, factor: 12 }]);
    const suffix = uniqueSuffix();
    const supplierId = randomUUID();
    await db
      .insertInto('suppliers')
      .values({
        id: supplierId,
        name: `S ${suffix}`,
        code: `S-${suffix}`,
        default_currency: 'EGP',
        is_active: true,
        custom_fields: '{}',
      })
      .execute();
    const poId = randomUUID();
    await db
      .insertInto('purchase_orders')
      .values({
        id: poId,
        po_number: `PO-${suffix}`,
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
        quantity: '3',
        unit_price_amount: '24000',
        unit_price_currency: 'EGP',
        unit_of_measure_id: cartonId,
        unit_factor: '12',
      })
      .execute();

    const receipt = await goodsReceipts.create(db, {
      purchaseOrderId: poId,
      warehouseId,
      lines: [{ purchaseOrderLineId: lineId, quantityReceived: 2 }],
    });
    expect(receipt.lines[0]).toMatchObject({ quantityReceived: 2, unitOfMeasureId: cartonId, unitFactor: 12 });
    await goodsReceipts.confirm(db, receipt.id, 'test', null);
    const event = await db
      .selectFrom('outbox_events')
      .select('payload')
      .where('event_type', '=', 'purchases.goods_receipt.confirmed')
      .where(sql`payload->>'entityId'`, '=', receipt.id)
      .executeTakeFirstOrThrow();
    const line = (
      event.payload as { metadata: { lines: { quantity: number; unitCost: { amountMinorUnits: string } }[] } }
    ).metadata.lines[0]!;
    expect(line.quantity).toBe(24);
    expect(line.unitCost.amountMinorUnits).toBe('2000');
  });
});

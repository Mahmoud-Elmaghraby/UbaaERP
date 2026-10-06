import { randomUUID } from 'node:crypto';
import type { Kysely } from 'kysely';
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
import { PurchaseReturnStockListener } from '../../src/modules/inventory/infrastructure/events/purchase-return-stock.listener';
import { SalesReturnStockListener } from '../../src/modules/inventory/infrastructure/events/sales-return-stock.listener';
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
import type { TenantConnectionManager } from '../../src/shared/tenancy/tenant-connection-manager';
import type { DomainEventPayload } from '../../src/shared/events/domain-event';
import { openIntegrationDb, uniqueSuffix } from './tenant-db';

/**
 * Lots, expiry and serials on documents (inventory audit 2026-10, C2):
 * goods receipts carry the lot split, deliveries pick FEFO without expired
 * lots (or the lots typed on the line), and returns go back through the
 * same lots the original document moved.
 */
describe('Lots/expiry/serials on documents (integration, real Postgres)', () => {
  let db: Kysely<TenantDatabase>;
  let stock: StockMovementsService;
  let warehouseId: string;
  let locationId: string;
  let receiptListener: GoodsReceiptStockListener;
  let deliveryListener: DeliveryStockListener;
  let purchaseReturnListener: PurchaseReturnStockListener;
  let salesReturnListener: SalesReturnStockListener;
  let goodsReceipts: GoodsReceiptsService;

  const cost = { amountMinorUnits: '1000', currency: 'EGP' };
  const isoDay = (offsetDays: number): string =>
    new Date(Date.now() + offsetDays * 86_400_000).toISOString().slice(0, 10);

  async function createProduct(trackingType: 'none' | 'lot' | 'serial'): Promise<string> {
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
        code: `L-${suffix}`,
        name: `Lot product ${suffix}`,
        unit_of_measure_id: unitId,
        tracking_type: trackingType,
        is_active: true,
        track_variants: false,
      })
      .execute();
    const variantId = randomUUID();
    await db
      .insertInto('product_variants')
      .values({ id: variantId, product_id: productId, sku: `LS-${suffix}`, is_active: true })
      .execute();
    return variantId;
  }

  function event(entityId: string, metadata: Record<string, unknown>): DomainEventPayload {
    return {
      schema: 'ignored-by-stub',
      entityType: 'document',
      entityId,
      action: 'confirmed',
      actorUserId: null,
      metadata: { warehouseId, ...metadata },
      occurredAt: new Date(),
    } as DomainEventPayload;
  }

  async function lotQuantities(variantId: string): Promise<Record<string, number>> {
    const rows = await db
      .selectFrom('stock_lot_levels')
      .innerJoin('stock_lots', 'stock_lots.id', 'stock_lot_levels.stock_lot_id')
      .select(['stock_lots.lot_number as lot', 'stock_lot_levels.quantity_on_hand as qty'])
      .where('stock_lots.product_variant_id', '=', variantId)
      .execute();
    return Object.fromEntries(rows.map((row) => [row.lot, Number(row.qty)]));
  }

  async function receive(
    variantId: string,
    lots: { lotNumber: string; expiryDate: string | null; quantity: number }[],
  ) {
    const id = randomUUID();
    await receiptListener.handle(
      event(id, {
        lines: [
          {
            productVariantId: variantId,
            quantity: lots.reduce((sum, lot) => sum + lot.quantity, 0),
            unitCost: cost,
            lots,
          },
        ],
      }),
    );
    return id;
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
      .values({ id: warehouseId, name: `Lots WH ${suffix}`, code: `LW-${suffix}`, is_active: true })
      .execute();
    await db
      .insertInto('warehouse_locations')
      .values({ id: locationId, warehouse_id: warehouseId, code: 'DEFAULT', name: 'Default', is_active: true })
      .execute();

    const connections = { getClient: () => db } as unknown as TenantConnectionManager;
    const locations = new KyselyWarehouseLocationRepository();
    const outbox = new OutboxWriterService(new KyselyOutboxEventRepository());
    receiptListener = new GoodsReceiptStockListener(stock, locations, connections);
    deliveryListener = new DeliveryStockListener(stock, locations, connections, outbox);
    purchaseReturnListener = new PurchaseReturnStockListener(stock, locations, connections);
    salesReturnListener = new SalesReturnStockListener(
      stock,
      new KyselyStockLevelRepository(),
      locations,
      connections,
      outbox,
    );

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
  });

  afterAll(async () => {
    await db.destroy();
  });

  it('receives a goods receipt lot by lot, with expiry dates', async () => {
    const variantId = await createProduct('lot');
    await receive(variantId, [
      { lotNumber: 'A1', expiryDate: isoDay(200), quantity: 6 },
      { lotNumber: 'B1', expiryDate: isoDay(400), quantity: 4 },
    ]);
    expect(await lotQuantities(variantId)).toEqual({ A1: 6, B1: 4 });
    const lot = await db
      .selectFrom('stock_lots')
      .select('expiry_date')
      .where('product_variant_id', '=', variantId)
      .where('lot_number', '=', 'A1')
      .executeTakeFirstOrThrow();
    expect(lot.expiry_date).not.toBeNull();
  });

  it('delivers FEFO and never ships an expired lot', async () => {
    const variantId = await createProduct('lot');
    await receive(variantId, [
      { lotNumber: 'OLD', expiryDate: isoDay(-5), quantity: 3 },
      { lotNumber: 'SOON', expiryDate: isoDay(30), quantity: 2 },
      { lotNumber: 'LATE', expiryDate: isoDay(300), quantity: 5 },
    ]);
    await deliveryListener.handle(event(randomUUID(), { lines: [{ productVariantId: variantId, quantity: 4 }] }));
    expect(await lotQuantities(variantId)).toEqual({ OLD: 3, SOON: 0, LATE: 3 });

    // 3 unexpired left + 3 expired: asking for 5 must fail, naming the expired stock.
    await expect(
      deliveryListener.handle(event(randomUUID(), { lines: [{ productVariantId: variantId, quantity: 5 }] })),
    ).rejects.toMatchObject({ code: 'STOCK_MOVEMENT.INSUFFICIENT_UNEXPIRED_STOCK' });

    // Picking the expired lot explicitly is refused too.
    await expect(
      deliveryListener.handle(
        event(randomUUID(), {
          lines: [{ productVariantId: variantId, quantity: 1, lots: [{ lotNumber: 'OLD', quantity: 1 }] }],
        }),
      ),
    ).rejects.toMatchObject({ code: 'STOCK_MOVEMENT.LOT_EXPIRED' });
  });

  it('honours the lots picked on a delivery line', async () => {
    const variantId = await createProduct('lot');
    await receive(variantId, [
      { lotNumber: 'P1', expiryDate: isoDay(10), quantity: 5 },
      { lotNumber: 'P2', expiryDate: isoDay(100), quantity: 5 },
    ]);
    await deliveryListener.handle(
      event(randomUUID(), {
        lines: [{ productVariantId: variantId, quantity: 3, lots: [{ lotNumber: 'P2', quantity: 3 }] }],
      }),
    );
    expect(await lotQuantities(variantId)).toEqual({ P1: 5, P2: 2 });
  });

  it('delivers several serials as one movement each and returns them into the same serials', async () => {
    const variantId = await createProduct('serial');
    await receive(variantId, [
      { lotNumber: 'SN-1', expiryDate: null, quantity: 1 },
      { lotNumber: 'SN-2', expiryDate: null, quantity: 1 },
      { lotNumber: 'SN-3', expiryDate: null, quantity: 1 },
    ]);
    const deliveryId = randomUUID();
    await deliveryListener.handle(event(deliveryId, { lines: [{ productVariantId: variantId, quantity: 2 }] }));
    const delivered = await lotQuantities(variantId);
    expect(Object.values(delivered).reduce((a, b) => a + b, 0)).toBe(1);

    await salesReturnListener.handle(
      event(randomUUID(), { deliveryId, lines: [{ productVariantId: variantId, quantity: 2 }] }),
    );
    expect(await lotQuantities(variantId)).toEqual({ 'SN-1': 1, 'SN-2': 1, 'SN-3': 1 });
  });

  it('returns sold lot stock back into the lot it left from', async () => {
    const variantId = await createProduct('lot');
    await receive(variantId, [
      { lotNumber: 'R1', expiryDate: isoDay(20), quantity: 2 },
      { lotNumber: 'R2', expiryDate: isoDay(200), quantity: 5 },
    ]);
    const deliveryId = randomUUID();
    await deliveryListener.handle(event(deliveryId, { lines: [{ productVariantId: variantId, quantity: 4 }] }));
    expect(await lotQuantities(variantId)).toEqual({ R1: 0, R2: 3 });
    await salesReturnListener.handle(
      event(randomUUID(), { deliveryId, lines: [{ productVariantId: variantId, quantity: 3 }] }),
    );
    // FEFO took R1 first (2) then R2 (2): the return refills R1 then R2.
    expect(await lotQuantities(variantId)).toEqual({ R1: 2, R2: 4 });
  });

  it('a purchase return takes back the lots of its own goods receipt, expired ones included', async () => {
    const variantId = await createProduct('lot');
    await receive(variantId, [{ lotNumber: 'EARLY', expiryDate: isoDay(5), quantity: 4 }]);
    const receiptId = await receive(variantId, [{ lotNumber: 'BAD', expiryDate: isoDay(-1), quantity: 3 }]);
    await purchaseReturnListener.handle(
      event(randomUUID(), { goodsReceiptId: receiptId, lines: [{ productVariantId: variantId, quantity: 3 }] }),
    );
    expect(await lotQuantities(variantId)).toEqual({ EARLY: 4, BAD: 0 });
  });

  it('lists lots expiring soon (and already expired) for the near-expiry report', async () => {
    const variantId = await createProduct('lot');
    await receive(variantId, [
      { lotNumber: 'X-EXPIRED', expiryDate: isoDay(-2), quantity: 1 },
      { lotNumber: 'X-SOON', expiryDate: isoDay(15), quantity: 2 },
      { lotNumber: 'X-FAR', expiryDate: isoDay(500), quantity: 3 },
    ]);
    const rows = (await stock.listExpiringLots(db, 30)).filter((row) => row.productVariantId === variantId);
    expect(rows.map((row) => row.lotNumber)).toEqual(['X-EXPIRED', 'X-SOON']);
    expect(rows[1]!.warehouseId).toBe(warehouseId);
  });

  describe('GoodsReceiptsService (purchases side)', () => {
    async function confirmedPurchaseOrder(variantId: string, quantity: number) {
      const suffix = uniqueSuffix();
      const supplierId = randomUUID();
      await db
        .insertInto('suppliers')
        .values({
          id: supplierId,
          name: `Supplier ${suffix}`,
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
          quantity: String(quantity),
          unit_price_amount: '1000',
          unit_price_currency: 'EGP',
        })
        .execute();
      return { poId, lineId };
    }

    it('rejects a lot-tracked line without lots, or whose lots do not add up', async () => {
      const variantId = await createProduct('lot');
      const { poId, lineId } = await confirmedPurchaseOrder(variantId, 5);
      await expect(
        goodsReceipts.create(db, {
          purchaseOrderId: poId,
          warehouseId,
          lines: [{ purchaseOrderLineId: lineId, quantityReceived: 5 }],
        }),
      ).rejects.toMatchObject({ code: 'GOODS_RECEIPT.LOTS_REQUIRED' });
      await expect(
        goodsReceipts.create(db, {
          purchaseOrderId: poId,
          warehouseId,
          lines: [
            {
              purchaseOrderLineId: lineId,
              quantityReceived: 5,
              lots: [{ lotNumber: 'Z', expiryDate: null, quantity: 4 }],
            },
          ],
        }),
      ).rejects.toMatchObject({ code: 'GOODS_RECEIPT.LOTS_QUANTITY_MISMATCH' });
    });

    it('stores the lots, puts them on the confirm event, and works inside a caller-owned transaction', async () => {
      const variantId = await createProduct('lot');
      const { poId, lineId } = await confirmedPurchaseOrder(variantId, 5);
      // The purchase invoice calls create()/confirm() with its own trx when
      // Goods Receipts is disabled — that used to throw inside Kysely.
      const receipt = await db.transaction().execute(async (trx) => {
        const created = await goodsReceipts.create(trx, {
          purchaseOrderId: poId,
          warehouseId,
          lines: [
            {
              purchaseOrderLineId: lineId,
              quantityReceived: 5,
              lots: [
                { lotNumber: ' K1 ', expiryDate: isoDay(90), quantity: 2 },
                { lotNumber: 'K2', expiryDate: null, quantity: 3 },
              ],
            },
          ],
        });
        await goodsReceipts.confirm(trx, created.id, 'test', null);
        return created;
      });
      expect(receipt.lines[0]!.lots).toEqual([
        { lotNumber: 'K1', expiryDate: isoDay(90), quantity: 2 },
        { lotNumber: 'K2', expiryDate: null, quantity: 3 },
      ]);
      const outboxRow = await db
        .selectFrom('outbox_events')
        .select('payload')
        .where('event_type', '=', 'purchases.goods_receipt.confirmed')
        .orderBy('created_at', 'desc')
        .executeTakeFirstOrThrow();
      const payload = outboxRow.payload as { entityId: string; metadata: { lines: { lots: unknown[] }[] } };
      expect(payload.entityId).toBe(receipt.id);
      expect(payload.metadata.lines[0]!.lots).toHaveLength(2);
    });

    it('rejects lots on an untracked item', async () => {
      const variantId = await createProduct('none');
      const { poId, lineId } = await confirmedPurchaseOrder(variantId, 1);
      await expect(
        goodsReceipts.create(db, {
          purchaseOrderId: poId,
          warehouseId,
          lines: [
            {
              purchaseOrderLineId: lineId,
              quantityReceived: 1,
              lots: [{ lotNumber: 'N', expiryDate: null, quantity: 1 }],
            },
          ],
        }),
      ).rejects.toMatchObject({ code: 'GOODS_RECEIPT.LOTS_NOT_TRACKED' });
    });
  });
});

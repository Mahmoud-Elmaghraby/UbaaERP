import { randomUUID } from 'node:crypto';
import type { Kysely } from 'kysely';
import { Money } from '@erp-platform/shared-kernel';
import type { TenantDatabase } from '../../src/database/tenant/kysely-client';
import { StockMovementsService } from '../../src/modules/inventory/application/services/stock-movements.service';
import { InventoryReportsService } from '../../src/modules/inventory/application/services/inventory-reports.service';
import { UnitsOfMeasureService } from '../../src/modules/inventory/application/services/units-of-measure.service';
import { KyselyStockLevelRepository } from '../../src/modules/inventory/infrastructure/persistence/kysely-stock-level.repository';
import { KyselyStockMovementRepository } from '../../src/modules/inventory/infrastructure/persistence/kysely-stock-movement.repository';
import { KyselyWarehouseLocationRepository } from '../../src/modules/inventory/infrastructure/persistence/kysely-warehouse-location.repository';
import { KyselyProductVariantRepository } from '../../src/modules/inventory/infrastructure/persistence/kysely-product-variant.repository';
import { KyselyProductRepository } from '../../src/modules/inventory/infrastructure/persistence/kysely-product.repository';
import { KyselyStockLotRepository } from '../../src/modules/inventory/infrastructure/persistence/kysely-stock-lot.repository';
import { KyselyUnitOfMeasureRepository } from '../../src/modules/inventory/infrastructure/persistence/kysely-unit-of-measure.repository';
import { KyselyInventoryReportsRepository } from '../../src/modules/inventory/infrastructure/persistence/kysely-inventory-reports.repository';
import { openIntegrationDb, uniqueSuffix } from './tenant-db';

/** Best sellers / slow movers: sold = deliveries − sales returns in the period; stock and last sale per item. */
describe('Inventory movement analysis (integration, real Postgres)', () => {
  let db: Kysely<TenantDatabase>;
  let movements: StockMovementsService;
  const reports = new InventoryReportsService(new KyselyInventoryReportsRepository());
  let warehouseId: string;
  let locationId: string;
  let categoryId: string;

  async function createItem(name: string): Promise<string> {
    const s = uniqueSuffix();
    const unitId = randomUUID();
    await db.insertInto('units_of_measure').values({ id: unitId, name: `pc-${s}`, symbol: `pc${s}`, is_active: true, conversion_factor: '1' }).execute();
    const productId = randomUUID();
    await db.insertInto('products').values({
      id: productId, code: `MA-${s}`, name: `${name} ${s}`, unit_of_measure_id: unitId, tracking_type: 'none', item_type: 'stock',
      is_active: true, track_variants: false, category_id: categoryId,
    }).execute();
    const variantId = randomUUID();
    await db.insertInto('product_variants').values({ id: variantId, product_id: productId, sku: `MA-${s}`, is_active: true }).execute();
    return variantId;
  }

  beforeAll(async () => {
    db = openIntegrationDb();
    movements = new StockMovementsService(
      new KyselyStockLevelRepository(),
      new KyselyStockMovementRepository(),
      new KyselyWarehouseLocationRepository(),
      new KyselyProductVariantRepository(),
      new KyselyProductRepository(),
      new KyselyStockLotRepository(),
      new UnitsOfMeasureService(new KyselyUnitOfMeasureRepository()),
    );
    const s = uniqueSuffix();
    warehouseId = randomUUID();
    await db.insertInto('warehouses').values({ id: warehouseId, name: `MA ${s}`, code: `MA-${s}`, is_active: true }).execute();
    locationId = randomUUID();
    await db.insertInto('warehouse_locations').values({ id: locationId, warehouse_id: warehouseId, code: `L-${s}`, name: 'L', is_active: true }).execute();
    const parent = randomUUID();
    categoryId = randomUUID();
    await db.insertInto('product_categories').values([
      { id: parent, name: `Clothes ${s}`, parent_id: null },
      { id: categoryId, name: `Shirts ${s}`, parent_id: parent },
    ]).execute();
    categoryId = parent; // filter by the parent: sub-categories are included
  });

  afterAll(async () => {
    await db.destroy();
  });

  it('counts sold net of returns, keeps stock and cost, and lists unsold stock as a slow mover', async () => {
    // Items live in the sub-category; the filter uses its parent.
    const sub = (await db.selectFrom('product_categories').select('id').where('parent_id', '=', categoryId).executeTakeFirstOrThrow()).id;
    const realCategory = categoryId;
    categoryId = sub;
    const seller = await createItem('Seller');
    const sleeper = await createItem('Sleeper');
    categoryId = realCategory;
    const base = { warehouseId, locationId, unitCost: Money.fromMinorUnits(1000n, 'EGP') };

    await movements.recordMovement(db, { ...base, productVariantId: seller, movementType: 'in', quantity: 20, referenceType: 'goods_receipt', referenceId: randomUUID() });
    await movements.recordMovement(db, { ...base, productVariantId: sleeper, movementType: 'in', quantity: 5, referenceType: 'goods_receipt', referenceId: randomUUID() });
    await movements.recordMovement(db, { warehouseId, locationId, productVariantId: seller, movementType: 'out', quantity: 8, referenceType: 'delivery', referenceId: randomUUID() });
    await movements.recordMovement(db, { ...base, productVariantId: seller, movementType: 'in', quantity: 2, referenceType: 'sales_return', referenceId: randomUUID() });

    const today = new Date();
    const from = new Date(today.getTime() - 86_400_000);
    const to = new Date(today.getTime() + 86_400_000);
    const rows = await reports.movementAnalysis(db, { from, to, warehouseId, categoryId });
    const s = rows.find((r) => r.productVariantId === seller)!;
    expect(s).toMatchObject({ onHand: 14, soldQuantity: 6, receivedQuantity: 20, soldCostMinor: '6000', stockValueMinor: '14000' });
    expect(s.lastSaleDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const z = rows.find((r) => r.productVariantId === sleeper)!;
    expect(z).toMatchObject({ onHand: 5, soldQuantity: 0, lastSaleDate: null });

    // Another warehouse filter sees nothing; a period before the movements sees stock but no sales.
    expect(await reports.movementAnalysis(db, { from, to, warehouseId: randomUUID(), categoryId })).toHaveLength(0);
    const earlier = await reports.movementAnalysis(db, { from: new Date(2020, 0, 1), to: new Date(2020, 1, 1), warehouseId, categoryId });
    expect(earlier.find((r) => r.productVariantId === seller)).toMatchObject({ soldQuantity: 0, onHand: 14, lastSaleDate: null });
    await expect(reports.movementAnalysis(db, { from: to, to: from, warehouseId, categoryId })).rejects.toThrow();
  });
});

import { randomUUID } from 'node:crypto';
import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../src/database/tenant/kysely-client';
import { ProductImportService } from '../../src/modules/inventory/application/services/product-import.service';
import { ProductsService } from '../../src/modules/inventory/application/services/products.service';
import { ProductCodesService } from '../../src/modules/inventory/application/services/product-codes.service';
import { ProductCatalogService } from '../../src/modules/inventory/application/services/product-catalog.service';
import { UnitsOfMeasureService } from '../../src/modules/inventory/application/services/units-of-measure.service';
import { StockCountsService } from '../../src/modules/inventory/application/services/stock-counts.service';
import { StockMovementsService } from '../../src/modules/inventory/application/services/stock-movements.service';
import { InventoryValuationEventsService } from '../../src/modules/inventory/application/services/inventory-valuation-events.service';
import { KyselyProductRepository } from '../../src/modules/inventory/infrastructure/persistence/kysely-product.repository';
import { KyselyProductVariantRepository } from '../../src/modules/inventory/infrastructure/persistence/kysely-product-variant.repository';
import { KyselyInventorySettingsRepository } from '../../src/modules/inventory/infrastructure/persistence/kysely-inventory-settings.repository';
import { KyselyProductCatalogRepository } from '../../src/modules/inventory/infrastructure/persistence/kysely-product-catalog.repository';
import { KyselyUnitOfMeasureRepository } from '../../src/modules/inventory/infrastructure/persistence/kysely-unit-of-measure.repository';
import { KyselyStockCountRepository } from '../../src/modules/inventory/infrastructure/persistence/kysely-stock-count.repository';
import { KyselyStockLotRepository } from '../../src/modules/inventory/infrastructure/persistence/kysely-stock-lot.repository';
import { KyselyWarehouseLocationRepository } from '../../src/modules/inventory/infrastructure/persistence/kysely-warehouse-location.repository';
import { KyselyStockLevelRepository } from '../../src/modules/inventory/infrastructure/persistence/kysely-stock-level.repository';
import { KyselyStockMovementRepository } from '../../src/modules/inventory/infrastructure/persistence/kysely-stock-movement.repository';
import { NumberingSequencesService } from '../../src/modules/settings/application/services/numbering-sequences.service';
import { KyselyNumberingSequenceRepository } from '../../src/modules/settings/infrastructure/persistence/kysely-numbering-sequence.repository';
import { TenantSettingsService } from '../../src/modules/settings/application/services/tenant-settings.service';
import { KyselyTenantSettingsRepository } from '../../src/modules/settings/infrastructure/persistence/kysely-tenant-settings.repository';
import { OutboxWriterService } from '../../src/shared/outbox/application/services/outbox-writer.service';
import { KyselyOutboxEventRepository } from '../../src/shared/outbox/infrastructure/persistence/kysely-outbox-event.repository';
import { openIntegrationDb, uniqueSuffix } from './tenant-db';

describe('Product import from Excel (integration, real Postgres)', () => {
  let db: Kysely<TenantDatabase>;
  let importer: ProductImportService;
  let unitName: string;
  let warehouseId: string;
  const options = {
    mode: 'create' as const,
    dryRun: true,
    skipInvalid: false,
    createMissingCategories: true,
    createMissingBrands: true,
    createMissingUnits: false,
  };

  beforeAll(async () => {
    db = openIntegrationDb();
    const products = new KyselyProductRepository();
    const variants = new KyselyProductVariantRepository();
    const numbering = new NumberingSequencesService(new KyselyNumberingSequenceRepository());
    const units = new UnitsOfMeasureService(new KyselyUnitOfMeasureRepository());
    const lots = new KyselyStockLotRepository();
    const locations = new KyselyWarehouseLocationRepository();
    const stock = new StockMovementsService(
      new KyselyStockLevelRepository(),
      new KyselyStockMovementRepository(),
      locations,
      variants,
      products,
      lots,
      units,
    );
    const outbox = new OutboxWriterService(new KyselyOutboxEventRepository());
    importer = new ProductImportService(
      products,
      variants,
      new ProductsService(products, variants, new ProductCodesService(new KyselyInventorySettingsRepository(), variants, numbering)),
      new ProductCatalogService(new KyselyProductCatalogRepository()),
      units,
      new StockCountsService(
        new KyselyStockCountRepository(),
        lots,
        locations,
        variants,
        products,
        stock,
        numbering,
        outbox,
        new InventoryValuationEventsService(outbox),
      ),
      new TenantSettingsService(new KyselyTenantSettingsRepository()),
    );
    const suffix = uniqueSuffix();
    unitName = `علبة${suffix}`;
    await db
      .insertInto('units_of_measure')
      .values({ id: randomUUID(), name: unitName, symbol: `box${suffix}`, is_active: true, conversion_factor: '1' })
      .execute();
    warehouseId = randomUUID();
    await db
      .insertInto('warehouses')
      .values({ id: warehouseId, name: `Import WH ${suffix}`, code: `IW-${suffix}`, is_active: true })
      .execute();
    await db
      .insertInto('warehouse_locations')
      .values({ id: randomUUID(), warehouse_id: warehouseId, code: 'DEFAULT', name: 'Default', is_active: true })
      .execute();
  });

  afterAll(async () => {
    await db.destroy();
  });

  it('a dry run validates every row (Arabic values, digits) and writes nothing; errors are per row', async () => {
    const suffix = uniqueSuffix();
    const result = await importer.import(
      db,
      [
        { rowNumber: 2, code: `IMP-${suffix}-1`, name: 'لبن', unit: unitName, category: `أغذية ${suffix} > ألبان`, itemType: 'مخزني', salePrice: '١٢٫٥٠' },
        { rowNumber: 3, code: `IMP-${suffix}-2`, name: 'توصيل', unit: unitName, itemType: 'خدمة' },
        { rowNumber: 4, code: `IMP-${suffix}-3`, name: 'سكر', unit: 'وحدة لا توجد' },
        { rowNumber: 5, code: `IMP-${suffix}-1`, name: 'مكرر', unit: unitName },
      ],
      options,
      null,
    );
    expect(result.committed).toBe(false);
    expect(result.rows.map((row) => row.status)).toEqual(['create', 'create', 'error', 'error']);
    expect(result.rows[2]!.errors[0]!.field).toBe('unit');
    expect(result.rows[3]!.errors[0]!.message).toContain('مكرر');
    expect(await db.selectFrom('products').select('id').where('code', 'like', `IMP-${suffix}-%`).execute()).toHaveLength(0);
    expect(
      await db.selectFrom('product_categories').select('id').where('name', '=', `أغذية ${suffix}`).execute(),
    ).toHaveLength(0);
  });

  it('a real import is all-or-nothing, then commits; upsert updates by code; opening quantities become a draft', async () => {
    const suffix = uniqueSuffix();
    const rows = [
      { rowNumber: 2, code: `IMP-${suffix}-A`, name: 'أرز', unit: unitName, category: `بقالة ${suffix} > حبوب`, brand: `ماركة ${suffix}`, purchasePrice: '20', openingQuantity: '10' },
      { rowNumber: 3, code: `IMP-${suffix}-B`, name: 'خدمة', unit: 'غير موجودة' },
    ];
    const failed = await importer.import(db, rows, { ...options, dryRun: false, openingWarehouseId: warehouseId }, null);
    expect(failed.committed).toBe(false);
    expect(await db.selectFrom('products').select('id').where('code', '=', `IMP-${suffix}-A`).execute()).toHaveLength(0);

    const ok = await importer.import(
      db,
      rows,
      { ...options, dryRun: false, skipInvalid: true, openingWarehouseId: warehouseId },
      null,
    );
    expect(ok.committed).toBe(true);
    expect(ok.created).toBe(1);
    expect(ok.failed).toBe(1);
    expect(ok.openingCountId).not.toBeNull();
    const product = await db
      .selectFrom('products')
      .select(['id', 'category_id', 'brand_id', 'purchase_price_amount'])
      .where('code', '=', `IMP-${suffix}-A`)
      .executeTakeFirstOrThrow();
    expect(product.category_id).not.toBeNull();
    expect(product.brand_id).not.toBeNull();
    const openingLines = await db
      .selectFrom('stock_count_lines')
      .select(['counted_quantity', 'unit_cost_amount'])
      .where('stock_count_id', '=', ok.openingCountId!)
      .execute();
    expect(openingLines.map((line) => [Number(line.counted_quantity), line.unit_cost_amount])).toEqual([[10, '2000']]);

    const upsert = await importer.import(
      db,
      [{ rowNumber: 2, code: `IMP-${suffix}-A`, name: 'أرز مصري', salePrice: '30' }],
      { ...options, mode: 'upsert', dryRun: false },
      null,
    );
    expect(upsert.updated).toBe(1);
    const renamed = await db
      .selectFrom('products')
      .select(['name', 'sale_price_amount'])
      .where('id', '=', product.id)
      .executeTakeFirstOrThrow();
    expect(renamed).toEqual({ name: 'أرز مصري', sale_price_amount: '3000' });
  });
});

import { randomUUID } from 'node:crypto';
import type { Kysely } from 'kysely';
import { Money } from '@erp-platform/shared-kernel';
import type { TenantDatabase } from '../../src/database/tenant/kysely-client';
import { ProductsService } from '../../src/modules/inventory/application/services/products.service';
import {
  ProductCodesService,
  ean13CheckDigit,
} from '../../src/modules/inventory/application/services/product-codes.service';
import { ProductCatalogService } from '../../src/modules/inventory/application/services/product-catalog.service';
import { KyselyProductRepository } from '../../src/modules/inventory/infrastructure/persistence/kysely-product.repository';
import { KyselyProductVariantRepository } from '../../src/modules/inventory/infrastructure/persistence/kysely-product-variant.repository';
import { KyselyInventorySettingsRepository } from '../../src/modules/inventory/infrastructure/persistence/kysely-inventory-settings.repository';
import { KyselyProductCatalogRepository } from '../../src/modules/inventory/infrastructure/persistence/kysely-product-catalog.repository';
import { NumberingSequencesService } from '../../src/modules/settings/application/services/numbering-sequences.service';
import { KyselyNumberingSequenceRepository } from '../../src/modules/settings/infrastructure/persistence/kysely-numbering-sequence.repository';
import { openIntegrationDb, uniqueSuffix } from './tenant-db';

/** Inventory step 3: automatic item codes / SKUs / EAN-13 barcodes, categories, master-data fields. */
describe('Product master data (integration, real Postgres)', () => {
  let db: Kysely<TenantDatabase>;
  let products: ProductsService;
  let catalog: ProductCatalogService;
  const settings = new KyselyInventorySettingsRepository();
  let unitId: string;

  beforeAll(async () => {
    db = openIntegrationDb();
    const variants = new KyselyProductVariantRepository();
    const codes = new ProductCodesService(
      settings,
      variants,
      new NumberingSequencesService(new KyselyNumberingSequenceRepository()),
    );
    products = new ProductsService(new KyselyProductRepository(), variants, codes);
    catalog = new ProductCatalogService(new KyselyProductCatalogRepository());
    unitId = randomUUID();
    const suffix = uniqueSuffix();
    await db
      .insertInto('units_of_measure')
      .values({ id: unitId, name: `u-${suffix}`, symbol: `u${suffix}`, is_active: true, conversion_factor: '1' })
      .execute();
  });

  afterEach(async () => {
    await settings.update(db, { itemCodeMode: 'manual', barcodeMode: 'manual', barcodePrefix: '2' });
  });

  afterAll(async () => {
    await db.destroy();
  });

  it('requires a code in manual mode', async () => {
    await expect(products.create(db, { name: 'No code', unitOfMeasureId: unitId })).rejects.toMatchObject({
      code: 'PRODUCT.CODE_REQUIRED',
    });
  });

  it('generates sequential item codes and valid EAN-13 barcodes in auto mode', async () => {
    await settings.update(db, { itemCodeMode: 'auto', barcodeMode: 'auto', barcodePrefix: '29' });
    const first = await products.create(db, { name: 'Auto 1', unitOfMeasureId: unitId });
    const second = await products.create(db, { name: 'Auto 2', unitOfMeasureId: unitId });

    expect(first.code).toMatch(/^ITM-\d{5}$/);
    expect(Number(second.code.slice(4))).toBe(Number(first.code.slice(4)) + 1);
    expect(first.variants[0].sku).toBe(first.code);

    const barcode = first.variants[0].barcode ?? '';
    expect(barcode).toMatch(/^29\d{11}$/);
    expect(Number(barcode[12])).toBe(ean13CheckDigit(barcode.slice(0, 12)));
    expect(second.variants[0].barcode).not.toBe(barcode);
  });

  it('keeps a typed code and barcode even in auto mode', async () => {
    await settings.update(db, { itemCodeMode: 'auto', barcodeMode: 'auto' });
    const code = `TYPED-${uniqueSuffix()}`;
    const created = await products.create(db, {
      code,
      name: 'Typed',
      unitOfMeasureId: unitId,
      defaultVariantBarcode: `62${Date.now()}`.slice(0, 13),
    });
    expect(created.code).toBe(code);
    expect(created.variants[0].barcode).toMatch(/^62/);
  });

  it('gives extra variants code-2, code-3 SKUs when none is typed', async () => {
    const code = `VAR-${uniqueSuffix()}`;
    const product = await products.create(db, { code, name: 'Shirt', unitOfMeasureId: unitId, trackVariants: true });
    const red = await products.addVariant(db, product.id, { attributeValues: { color: 'red' } });
    const blue = await products.addVariant(db, product.id, { attributeValues: { color: 'blue' } });
    expect(red.sku).toBe(code);
    expect(blue.sku).toBe(`${code}-2`);
  });

  it('stores category, brand, prices and item type, and exposes them in the catalogue lookup', async () => {
    const parent = await catalog.createCategory(db, { name: `Tiles ${uniqueSuffix()}` });
    const child = await catalog.createCategory(db, { name: 'Floor', parentId: parent.id });
    const brand = await catalog.createBrand(db, { name: `Brand ${uniqueSuffix()}` });
    const created = await products.create(db, {
      code: `SVC-${uniqueSuffix()}`,
      name: 'Installation',
      unitOfMeasureId: unitId,
      itemType: 'service',
      categoryId: child.id,
      brandId: brand.id,
      salePrice: Money.fromMinorUnits(15000n, 'EGP'),
    });
    expect(created).toMatchObject({ itemType: 'service', categoryId: child.id, brandId: brand.id, purchasePrice: null });
    expect(created.salePrice?.toMinorUnits()).toBe(15000n);

    const row = (await new KyselyProductVariantRepository().listLookup(db)).find((v) => v.productId === created.id);
    expect(row).toMatchObject({ itemType: 'service', categoryId: child.id });
    expect(row?.salePrice?.toMinorUnits()).toBe(15000n);

    await expect(catalog.updateCategory(db, parent.id, { parentId: child.id })).rejects.toMatchObject({
      code: 'PRODUCT_CATEGORY.CYCLE',
    });
    await expect(catalog.deleteCategory(db, child.id)).rejects.toMatchObject({ code: 'PRODUCT_CATEGORY.IN_USE' });
  });

  it('adds pack barcodes that resolve in the catalogue lookup and can never collide with another code', async () => {
    const code = `PK-${uniqueSuffix()}`;
    const product = await products.create(db, {
      code,
      name: 'Juice',
      unitOfMeasureId: unitId,
      defaultVariantBarcode: `P1${uniqueSuffix()}`,
    });
    const variant = product.variants[0];
    const cartonCode = `C${uniqueSuffix()}`;
    const carton = await products.addVariantBarcode(db, product.id, variant.id, {
      barcode: cartonCode,
      quantity: 12,
      label: 'كرتونة',
    });
    expect(carton.quantity).toBe(12);

    const row = (await new KyselyProductVariantRepository().listLookup(db)).find((v) => v.id === variant.id);
    expect(row?.extraBarcodes).toEqual([{ barcode: cartonCode, quantity: 12, label: 'كرتونة' }]);

    // the primary barcode and an existing extra one are both refused
    await expect(
      products.addVariantBarcode(db, product.id, variant.id, { barcode: variant.barcode ?? '' }),
    ).rejects.toMatchObject({ code: 'PRODUCT_VARIANT.DUPLICATE_BARCODE' });
    await expect(
      products.updateVariant(db, product.id, variant.id, { barcode: cartonCode }),
    ).rejects.toMatchObject({ code: 'PRODUCT_VARIANT.DUPLICATE_BARCODE' });

    await products.removeVariantBarcode(db, product.id, variant.id, carton.id);
    expect(await products.listVariantBarcodes(db, product.id, variant.id)).toEqual([]);
  });

  it('generates a size × colour matrix once, skipping combinations that already exist', async () => {
    const code = `TS-${uniqueSuffix()}`;
    const product = await products.create(db, {
      code,
      name: 'T-shirt',
      unitOfMeasureId: unitId,
      trackVariants: true,
      attributes: ['المقاس', 'اللون'],
    });
    const first = await products.generateVariants(db, product.id, { المقاس: ['S', 'M'], اللون: ['أحمر', 'أزرق'] });
    expect(first).toHaveLength(4);
    expect(first.map((v) => v.sku)).toEqual([code, `${code}-2`, `${code}-3`, `${code}-4`]);

    const again = await products.generateVariants(db, product.id, { المقاس: ['S', 'M', 'L'], اللون: ['أحمر', 'أزرق'] });
    expect(again).toHaveLength(2);
    expect(again.every((v) => v.attributeValues['المقاس'] === 'L')).toBe(true);

    await expect(products.generateVariants(db, product.id, { الخامة: ['قطن'] })).rejects.toMatchObject({
      code: 'PRODUCT_VARIANT.MATRIX_INVALID_OPTIONS',
    });
  });
});

import { randomUUID } from 'node:crypto';
import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../src/database/tenant/kysely-client';
import { PriceListsService } from '../../src/modules/sales/application/services/price-lists.service';
import { SuppliersService } from '../../src/modules/purchases/application/services/suppliers.service';
import { KyselySupplierRepository } from '../../src/modules/purchases/infrastructure/persistence/kysely-supplier.repository';
import { NumberingSequencesService } from '../../src/modules/settings/application/services/numbering-sequences.service';
import { KyselyNumberingSequenceRepository } from '../../src/modules/settings/infrastructure/persistence/kysely-numbering-sequence.repository';
import { openIntegrationDb, uniqueSuffix } from './tenant-db';

/** Sales and supplier price lists share one table, told apart by kind (migration 0115). */
describe('Price lists by kind (integration, real Postgres)', () => {
  let db: Kysely<TenantDatabase>;
  const lists = new PriceListsService();
  let suppliers: SuppliersService;

  beforeAll(() => {
    db = openIntegrationDb();
    suppliers = new SuppliersService(
      new KyselySupplierRepository(),
      new NumberingSequencesService(new KyselyNumberingSequenceRepository()),
    );
  });

  afterAll(async () => {
    await db.destroy();
  });

  it('keeps sale and purchase lists apart, and only a purchase list can be a supplier default', async () => {
    const name = `Wholesale ${uniqueSuffix()}`;
    const sale = await lists.save(db, null, { name, currency: 'EGP', items: [] }, 'sale');
    // The same name is fine in the other kind.
    const purchase = await lists.save(db, null, { name, currency: 'EGP', adjustPercent: '-5', items: [] }, 'purchase');
    expect(purchase.kind).toBe('purchase');
    await expect(lists.save(db, null, { name, currency: 'EGP', items: [] }, 'purchase')).rejects.toThrow();

    expect((await lists.list(db, 'sale')).some((l) => l.id === purchase.id)).toBe(false);
    expect((await lists.list(db, 'purchase')).some((l) => l.id === purchase.id)).toBe(true);
    await expect(lists.getById(db, sale.id, 'purchase')).rejects.toThrow();
    await expect(lists.delete(db, sale.id, 'purchase')).rejects.toThrow();

    const supplier = await suppliers.create(db, { name: `PL supplier ${uniqueSuffix()}`, defaultCurrency: 'EGP', priceListId: purchase.id });
    expect(supplier.priceListId).toBe(purchase.id);
    await expect(suppliers.update(db, supplier.id, { priceListId: sale.id })).rejects.toMatchObject({
      code: 'SUPPLIER.PRICE_LIST_KIND',
    });
    expect((await lists.getById(db, purchase.id, 'purchase')).supplierCount).toBe(1);
    await expect(lists.delete(db, purchase.id, 'purchase')).rejects.toMatchObject({ code: 'PRICE_LIST.IN_USE' });

    await suppliers.update(db, supplier.id, { priceListId: null });
    await lists.delete(db, purchase.id, 'purchase');
    await lists.delete(db, sale.id, 'sale');
  });

  it('keeps a signed adjustment and category rules that reach sub-categories (migration 0122)', async () => {
    const parent = randomUUID();
    const child = randomUUID();
    const other = randomUUID();
    const suffix = uniqueSuffix();
    await db
      .insertInto('product_categories')
      .values([
        { id: parent, name: `Clothes ${suffix}`, parent_id: null },
        { id: child, name: `Shirts ${suffix}`, parent_id: parent },
        { id: other, name: `Shoes ${suffix}`, parent_id: null },
      ])
      .execute();
    const saved = await lists.save(db, null, {
      name: `Jumia ${suffix}`,
      currency: 'EGP',
      adjustPercent: '15',
      items: [],
      categoryRules: [{ categoryId: parent, adjustPercent: '-20' }],
    });
    expect(saved.adjustPercent).toBe('15');
    expect(saved.categoryRules).toEqual([{ categoryId: parent, adjustPercent: '-20' }]);
    expect(saved.categoryAdjust[parent]).toBe('-20');
    expect(saved.categoryAdjust[child]).toBe('-20');
    expect(saved.categoryAdjust[other]).toBeUndefined();
    await expect(
      lists.save(db, saved.id, { name: saved.name, currency: 'EGP', items: [], categoryRules: [{ categoryId: other, adjustPercent: '5' }, { categoryId: other, adjustPercent: '6' }] }),
    ).rejects.toMatchObject({ code: 'PRICE_LIST.DUPLICATE_CATEGORY' });
    await lists.delete(db, saved.id, 'sale');
  });
});

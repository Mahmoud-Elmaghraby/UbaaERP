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
    const purchase = await lists.save(db, null, { name, currency: 'EGP', discountPercent: '5', items: [] }, 'purchase');
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
});

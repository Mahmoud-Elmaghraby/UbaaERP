import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../src/database/tenant/kysely-client';
import { KyselyTaxRuleRepository } from '../../src/modules/settings/infrastructure/persistence/kysely-tax-rule.repository';
import { openIntegrationDb, uniqueSuffix } from './tenant-db';

describe('KyselyTaxRuleRepository (integration, real Postgres)', () => {
  let db: Kysely<TenantDatabase>;
  const repository = new KyselyTaxRuleRepository();

  beforeAll(() => {
    db = openIntegrationDb();
  });

  afterAll(async () => {
    await db.destroy();
  });

  it('creates a tax rule and reads back rate as a real JS number, not the raw NUMERIC string', async () => {
    const created = await repository.create(db, { name: `VAT-${uniqueSuffix()}`, rate: 14.5 });

    expect(typeof created.rate).toBe('number');
    expect(created.rate).toBe(14.5);
    expect(created.isActive).toBe(true); // default

    const found = await repository.findById(db, created.id);
    expect(found?.rate).toBe(14.5);
  });

  it('update() changes the rate and preserves numeric precision', async () => {
    const created = await repository.create(db, { name: `Rate-${uniqueSuffix()}`, rate: 10 });
    const updated = await repository.update(db, created.id, { rate: 12.75 });
    expect(updated?.rate).toBe(12.75);
  });

  it('update()/findById()/delete() report absence for a nonexistent id without throwing', async () => {
    const missingId = '00000000-0000-0000-0000-000000000000';
    await expect(repository.findById(db, missingId)).resolves.toBeNull();
    await expect(repository.update(db, missingId, { rate: 1 })).resolves.toBeNull();
    await expect(repository.delete(db, missingId)).resolves.toBe(false);
  });

  it('delete() removes the row', async () => {
    const created = await repository.create(db, { name: `Del-${uniqueSuffix()}`, rate: 5 });
    await expect(repository.delete(db, created.id)).resolves.toBe(true);
    await expect(repository.findById(db, created.id)).resolves.toBeNull();
  });

  it('list() is ordered by name and includes newly created rules', async () => {
    const nameA = `AAA-Tax-${uniqueSuffix()}`;
    const nameB = `ZZZ-Tax-${uniqueSuffix()}`;
    await repository.create(db, { name: nameB, rate: 1 });
    await repository.create(db, { name: nameA, rate: 1 });

    const all = await repository.list(db);
    const names = all.map((r) => r.name);
    expect(names.indexOf(nameA)).toBeLessThan(names.indexOf(nameB));
  });
});

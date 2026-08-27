import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../src/database/tenant/kysely-client';
import { KyselyTenantSettingsRepository } from '../../src/modules/settings/infrastructure/persistence/kysely-tenant-settings.repository';
import { openIntegrationDb } from './tenant-db';

describe('KyselyTenantSettingsRepository (integration, real Postgres)', () => {
  let db: Kysely<TenantDatabase>;
  const repository = new KyselyTenantSettingsRepository();

  beforeAll(() => {
    db = openIntegrationDb();
  });

  afterAll(async () => {
    await db.destroy();
  });

  it('getOrCreate() creates the singleton row with EGP as the default currency on first call', async () => {
    const settings = await repository.getOrCreate(db);
    expect(settings.id).toBeTruthy();
    expect(settings.currencyCode).toBe('EGP');
  });

  it('getOrCreate() returns the SAME row on every subsequent call — the tenant has exactly one', async () => {
    const first = await repository.getOrCreate(db);
    const second = await repository.getOrCreate(db);
    expect(second.id).toBe(first.id);
  });

  it('update() persists a currency change and getOrCreate() reflects it afterwards', async () => {
    await repository.update(db, { currencyCode: 'USD' });
    const settings = await repository.getOrCreate(db);
    expect(settings.currencyCode).toBe('USD');

    // Restore, so this test file's ordering doesn't leak into any other
    // integration test that happens to read tenant_settings later.
    await repository.update(db, { currencyCode: 'EGP' });
  });

  it('update() with an empty input is a no-op that still returns the current settings', async () => {
    const before = await repository.getOrCreate(db);
    const after = await repository.update(db, {});
    expect(after).toEqual(before);
  });
});

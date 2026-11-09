import type { Kysely } from 'kysely';
import type { EventEmitter2 } from '@nestjs/event-emitter';
import type { TenantDatabase } from '../../src/database/tenant/kysely-client';
import { AppSettingsRepository } from '../../src/shared/app-settings/app-settings.repository';
import { AppSettingsService } from '../../src/modules/settings/application/services/app-settings.service';
import { openIntegrationDb } from './tenant-db';

/** The settings hub store (0119) and the activity-feature defaults (0118). */
describe('Settings hub (integration, real Postgres)', () => {
  let db: Kysely<TenantDatabase>;
  const emit = jest.fn();
  const repo = new AppSettingsRepository();
  let service: AppSettingsService;

  beforeAll(() => {
    db = openIntegrationDb();
    service = new AppSettingsService(repo, { emit } as unknown as EventEmitter2);
  });

  afterAll(async () => {
    await db.deleteFrom('app_settings').execute();
    await db.destroy();
  });

  it('returns defaults, stores a change with an audit event, and resets back', async () => {
    const before = await service.list(db);
    expect(before.find((e) => e.key === 'security.lockoutMinutes')).toMatchObject({ value: 15, isDefault: true });

    await service.update(db, 'tenant_x', { 'security.lockoutMinutes': 30 }, '00000000-0000-0000-0000-000000000001');
    expect(await repo.get(db, 'security.lockoutMinutes')).toBe(30);
    expect(emit).toHaveBeenCalledWith(
      'settings.app_setting.updated',
      expect.objectContaining({ entityId: 'security.lockoutMinutes', metadata: expect.objectContaining({ from: 15, to: 30 }) }),
    );

    await service.update(db, 'tenant_x', { 'security.lockoutMinutes': null }, '00000000-0000-0000-0000-000000000001');
    expect(await repo.get(db, 'security.lockoutMinutes')).toBe(15);
  });

  it('refuses unknown keys and out-of-range values without writing anything', async () => {
    await expect(service.update(db, 'x', { 'security.lockoutMinutes': 0 }, 'u')).rejects.toMatchObject({ code: 'APP_SETTING.INVALID' });
    await expect(service.update(db, 'x', { nope: 1 }, 'u')).rejects.toMatchObject({ code: 'APP_SETTING.UNKNOWN' });
    expect((await service.list(db)).every((e) => e.isDefault)).toBe(true);
  });

  it('switched unused activity features off for a fresh tenant (migration 0118)', async () => {
    const rows = await db.selectFrom('tenant_feature_toggles').selectAll().execute();
    const off = new Set(rows.filter((r) => !r.enabled).map((r) => r.feature_key));
    // Migrations ran on an empty schema, so every activity option starts off.
    for (const key of ['sales.channels', 'sales.installments', 'sales.reps', 'cheques', 'pos', 'inventory.landed_costs', 'fixed_assets', 'budgets']) {
      expect(off.has(key)).toBe(true);
    }
    // Core document-chain switches are untouched (no row = on).
    expect(off.has('sales.quotations')).toBe(false);
  });
});

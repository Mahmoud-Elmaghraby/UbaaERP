import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import type { TenantSettingsRepository } from '../ports/tenant-settings.repository';
import type { TenantSettings } from '../../domain/tenant-settings.entity';
import { TenantSettingsService } from './tenant-settings.service';

const FAKE_DB = {} as Kysely<TenantDatabase>;

function makeSettings(overrides: Partial<TenantSettings> = {}): TenantSettings {
  return {
    id: 'settings-1',
    currencyCode: 'EGP',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

function makeMockRepository(): jest.Mocked<TenantSettingsRepository> {
  return { getOrCreate: jest.fn(), update: jest.fn() };
}

describe('TenantSettingsService', () => {
  let repository: jest.Mocked<TenantSettingsRepository>;
  let service: TenantSettingsService;

  beforeEach(() => {
    repository = makeMockRepository();
    service = new TenantSettingsService(repository);
  });

  it('get() delegates to repository.getOrCreate()', async () => {
    const settings = makeSettings();
    repository.getOrCreate.mockResolvedValue(settings);

    await expect(service.get(FAKE_DB)).resolves.toBe(settings);
    expect(repository.getOrCreate).toHaveBeenCalledWith(FAKE_DB);
  });

  it('update() delegates to repository.update() with the given input', async () => {
    const updated = makeSettings({ currencyCode: 'USD' });
    repository.update.mockResolvedValue(updated);

    await expect(service.update(FAKE_DB, { currencyCode: 'USD' })).resolves.toBe(updated);
    expect(repository.update).toHaveBeenCalledWith(FAKE_DB, { currencyCode: 'USD' });
  });
});

import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import type { ExchangeRateRepository } from '../ports/exchange-rate.repository';
import type { ExchangeRateProvider } from '../ports/exchange-rate-provider';
import type { ExchangeRate } from '../../domain/exchange-rate.entity';
import { BusinessRuleError, POSTGRES_UNIQUE_VIOLATION } from '../errors';
import { ExchangeRateSyncService } from './exchange-rate-sync.service';

const FAKE_DB = {} as Kysely<TenantDatabase>;

function makeRate(overrides: Partial<ExchangeRate> = {}): ExchangeRate {
  return {
    id: 'rate-1',
    fromCurrency: 'USD',
    toCurrency: 'EGP',
    rate: '51.341',
    rateDate: '2026-09-13',
    source: 'api',
    createdAt: new Date('2026-09-13T00:00:00Z'),
    ...overrides,
  };
}

function makeMockRepository(): jest.Mocked<ExchangeRateRepository> {
  return { list: jest.fn(), findById: jest.fn(), create: jest.fn(), findEffectiveRate: jest.fn() };
}

function makeMockProvider(): jest.Mocked<ExchangeRateProvider> {
  return { getLatestRate: jest.fn() };
}

function uniqueViolation(): Error & { code: string } {
  return Object.assign(new Error('duplicate key'), { code: POSTGRES_UNIQUE_VIOLATION });
}

describe('ExchangeRateSyncService', () => {
  let repository: jest.Mocked<ExchangeRateRepository>;
  let provider: jest.Mocked<ExchangeRateProvider>;
  let service: ExchangeRateSyncService;

  beforeEach(() => {
    repository = makeMockRepository();
    provider = makeMockProvider();
    service = new ExchangeRateSyncService(repository, provider);
  });

  describe('syncOne()', () => {
    it('throws EXCHANGE_RATE.SAME_CURRENCY without calling the provider', async () => {
      await expect(service.syncOne(FAKE_DB, 'EGP', 'egp')).rejects.toThrow(BusinessRuleError);
      expect(provider.getLatestRate).not.toHaveBeenCalled();
      expect(repository.create).not.toHaveBeenCalled();
    });

    it('returns status "unavailable" when the provider has no rate for this pair', async () => {
      provider.getLatestRate.mockResolvedValue(null);

      await expect(service.syncOne(FAKE_DB, 'usd', 'egp')).resolves.toEqual({
        fromCurrency: 'USD',
        toCurrency: 'EGP',
        status: 'unavailable',
      });
      expect(repository.create).not.toHaveBeenCalled();
    });

    it('stores the quote as an api-sourced rate and returns status "synced"', async () => {
      provider.getLatestRate.mockResolvedValue({ rate: '51.341', rateDate: '2026-09-13' });
      const stored = makeRate();
      repository.create.mockResolvedValue(stored);

      await expect(service.syncOne(FAKE_DB, 'USD', 'EGP')).resolves.toEqual({
        fromCurrency: 'USD',
        toCurrency: 'EGP',
        status: 'synced',
        rate: stored,
      });
      expect(repository.create).toHaveBeenCalledWith(FAKE_DB, {
        fromCurrency: 'USD',
        toCurrency: 'EGP',
        rate: '51.341',
        rateDate: '2026-09-13',
        source: 'api',
      });
    });

    it('returns status "already_up_to_date" instead of throwing on a duplicate row', async () => {
      provider.getLatestRate.mockResolvedValue({ rate: '51.341', rateDate: '2026-09-13' });
      repository.create.mockRejectedValue(uniqueViolation());

      await expect(service.syncOne(FAKE_DB, 'USD', 'EGP')).resolves.toEqual({
        fromCurrency: 'USD',
        toCurrency: 'EGP',
        status: 'already_up_to_date',
      });
    });

    it('rethrows an unexpected repository error', async () => {
      provider.getLatestRate.mockResolvedValue({ rate: '51.341', rateDate: '2026-09-13' });
      repository.create.mockRejectedValue(new Error('connection reset'));

      await expect(service.syncOne(FAKE_DB, 'USD', 'EGP')).rejects.toThrow('connection reset');
    });
  });

  describe('syncMany()', () => {
    it('syncs each pair independently and preserves order', async () => {
      provider.getLatestRate
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ rate: '2', rateDate: '2026-09-13' });
      repository.create.mockResolvedValue(makeRate({ fromCurrency: 'EUR', toCurrency: 'EGP', rate: '2' }));

      const results = await service.syncMany(FAKE_DB, [
        { fromCurrency: 'USD', toCurrency: 'EGP' },
        { fromCurrency: 'EUR', toCurrency: 'EGP' },
      ]);

      expect(results).toEqual([
        { fromCurrency: 'USD', toCurrency: 'EGP', status: 'unavailable' },
        {
          fromCurrency: 'EUR',
          toCurrency: 'EGP',
          status: 'synced',
          rate: expect.objectContaining({ fromCurrency: 'EUR', toCurrency: 'EGP' }),
        },
      ]);
    });
  });
});

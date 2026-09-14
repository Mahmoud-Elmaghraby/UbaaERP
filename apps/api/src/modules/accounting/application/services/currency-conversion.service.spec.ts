import type { Kysely } from 'kysely';
import { Money } from '@erp-platform/shared-kernel';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import type { ExchangeRateRepository } from '../ports/exchange-rate.repository';
import type { ExchangeRate } from '../../domain/exchange-rate.entity';
import { BusinessRuleError } from '../errors';
import { CurrencyConversionService } from './currency-conversion.service';

const FAKE_DB = {} as Kysely<TenantDatabase>;

function makeRate(overrides: Partial<ExchangeRate> = {}): ExchangeRate {
  return {
    id: 'rate-1',
    fromCurrency: 'USD',
    toCurrency: 'EGP',
    rate: '51.341',
    rateDate: '2026-09-13',
    source: 'manual',
    createdAt: new Date('2026-09-13T00:00:00Z'),
    ...overrides,
  };
}

function makeMockRepository(): jest.Mocked<ExchangeRateRepository> {
  return { list: jest.fn(), findById: jest.fn(), create: jest.fn(), findEffectiveRate: jest.fn() };
}

describe('CurrencyConversionService', () => {
  let repository: jest.Mocked<ExchangeRateRepository>;
  let service: CurrencyConversionService;

  beforeEach(() => {
    repository = makeMockRepository();
    service = new CurrencyConversionService(repository);
  });

  describe('convert()', () => {
    it('is a no-op when the amount is already in the target currency — no repository lookup', async () => {
      const amount = Money.fromMinorUnits(10000, 'EGP');

      const result = await service.convert(FAKE_DB, amount, 'EGP', '2026-09-13');

      expect(result.convertedAmount).toBe(amount);
      expect(result.rateUsed).toBe('1');
      expect(result.rateDate).toBe('2026-09-13');
      expect(repository.findEffectiveRate).not.toHaveBeenCalled();
    });

    it('converts using the effective rate for the given date', async () => {
      repository.findEffectiveRate.mockResolvedValue(makeRate({ rate: '51.341' }));
      // 100.00 USD (10000 minor units) * 51.341 = 5134.10... -> rounds to 513410 minor EGP units.
      const amount = Money.fromMinorUnits(10000, 'USD');

      const result = await service.convert(FAKE_DB, amount, 'EGP', '2026-09-13');

      expect(repository.findEffectiveRate).toHaveBeenCalledWith(FAKE_DB, 'USD', 'EGP', '2026-09-13');
      expect(result.convertedAmount.currency).toBe('EGP');
      expect(result.convertedAmount.toMinorUnits()).toBe(513410n);
      expect(result.rateUsed).toBe('51.341');
      expect(result.rateSource).toBe('manual');
    });

    it('rounds to the nearest minor unit rather than truncating', async () => {
      repository.findEffectiveRate.mockResolvedValue(makeRate({ rate: '1.005' }));
      // 1.00 USD (100 minor units) * 1.005 = 100.5 -> rounds to 101 (banker's-free "round half up" via Math.round).
      const amount = Money.fromMinorUnits(100, 'USD');

      const result = await service.convert(FAKE_DB, amount, 'EGP', '2026-09-13');

      expect(result.convertedAmount.toMinorUnits()).toBe(101n);
    });

    it('uses the rate\'s own rateDate/source, which may differ from the earlier date it was recorded on', async () => {
      repository.findEffectiveRate.mockResolvedValue(
        makeRate({ rate: '51.0', rateDate: '2026-09-10', source: 'api' }),
      );
      const amount = Money.fromMinorUnits(10000, 'USD');

      const result = await service.convert(FAKE_DB, amount, 'EGP', '2026-09-13');

      expect(result.rateDate).toBe('2026-09-10');
      expect(result.rateSource).toBe('api');
    });

    it('throws EXCHANGE_RATE.NOT_AVAILABLE when no rate covers the requested date', async () => {
      repository.findEffectiveRate.mockResolvedValue(null);
      const amount = Money.fromMinorUnits(10000, 'USD');

      await expect(service.convert(FAKE_DB, amount, 'EGP', '2026-09-13')).rejects.toThrow(BusinessRuleError);
      await expect(service.convert(FAKE_DB, amount, 'EGP', '2026-09-13')).rejects.toMatchObject({
        code: 'EXCHANGE_RATE.NOT_AVAILABLE',
        params: { from: 'USD', to: 'EGP', date: '2026-09-13' },
      });
    });
  });
});

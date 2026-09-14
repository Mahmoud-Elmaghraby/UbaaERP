import { FrankfurterExchangeRateProvider } from './frankfurter-exchange-rate.provider';

type FakeResponse = Pick<Response, 'ok' | 'status'> & { json: () => Promise<unknown> };

function mockFetch(impl: () => Promise<FakeResponse>): void {
  global.fetch = jest.fn(impl) as unknown as typeof fetch;
}

describe('FrankfurterExchangeRateProvider', () => {
  const originalFetch = global.fetch;
  let provider: FrankfurterExchangeRateProvider;

  beforeEach(() => {
    provider = new FrankfurterExchangeRateProvider();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('returns the rate and date on a successful response', async () => {
    mockFetch(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ date: '2026-09-13', base: 'USD', quote: 'EGP', rate: 51.341 }),
    }));

    await expect(provider.getLatestRate('USD', 'EGP')).resolves.toEqual({
      rate: '51.341',
      rateDate: '2026-09-13',
    });
    expect(global.fetch).toHaveBeenCalledWith('https://api.frankfurter.dev/v2/rate/USD/EGP');
  });

  it('returns null on a non-OK HTTP response instead of throwing', async () => {
    mockFetch(async () => ({ ok: false, status: 404, json: async () => ({}) }));
    await expect(provider.getLatestRate('USD', 'XXX')).resolves.toBeNull();
  });

  it('returns null when the response body has no usable rate', async () => {
    mockFetch(async () => ({ ok: true, status: 200, json: async () => ({ date: '2026-09-13' }) }));
    await expect(provider.getLatestRate('USD', 'EGP')).resolves.toBeNull();
  });

  it('returns null when the rate is not a positive number', async () => {
    mockFetch(async () => ({ ok: true, status: 200, json: async () => ({ date: '2026-09-13', rate: -1 }) }));
    await expect(provider.getLatestRate('USD', 'EGP')).resolves.toBeNull();
  });

  it('returns null instead of throwing when the network request itself fails', async () => {
    global.fetch = jest.fn(async () => {
      throw new Error('network down');
    }) as unknown as typeof fetch;

    await expect(provider.getLatestRate('USD', 'EGP')).resolves.toBeNull();
  });

  it('returns null when the response body is not valid JSON', async () => {
    mockFetch(async () => ({
      ok: true,
      status: 200,
      json: async () => {
        throw new Error('invalid json');
      },
    }));
    await expect(provider.getLatestRate('USD', 'EGP')).resolves.toBeNull();
  });
});

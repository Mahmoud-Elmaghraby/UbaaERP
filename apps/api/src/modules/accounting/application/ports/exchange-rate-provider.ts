/**
 * Live exchange-rate source port (claude/multi-currency-strategy.md,
 * Phase 2). Abstracts the actual external FX API behind an interface so
 * ExchangeRateSyncService (application layer) never talks to a
 * particular HTTP endpoint directly — same Clean Architecture shape as
 * every other *.repository.ts port in this module. See
 * frankfurter-exchange-rate.provider.ts (infrastructure layer) for the
 * concrete implementation and why frankfurter.dev (not frankfurter.app,
 * the originally-confirmed choice — see the strategy doc's §3.7) is
 * what's actually behind it.
 */
export interface ExchangeRateQuote {
  /** Units of the target currency per 1 unit of the source currency, as a decimal string. */
  rate: string;
  /** The date the provider says this rate is effective for (ISO "YYYY-MM-DD"). */
  rateDate: string;
}

export interface ExchangeRateProvider {
  /**
   * Fetches the current rate for fromCurrency -> toCurrency from the
   * live source. Returns null — never throws — when the source has no
   * rate for this pair (unsupported currency, transient outage, network
   * failure): a live-rate lookup failing must never block anything, it
   * just means nothing gets synced this time. CurrencyConversionService's
   * own EXCHANGE_RATE.NOT_AVAILABLE error plus the manual-entry endpoint
   * (ExchangeRatesController) remain the fallback, exactly as decided in
   * the strategy doc's §5.
   */
  getLatestRate(fromCurrency: string, toCurrency: string): Promise<ExchangeRateQuote | null>;
}

export const EXCHANGE_RATE_PROVIDER = Symbol('EXCHANGE_RATE_PROVIDER');

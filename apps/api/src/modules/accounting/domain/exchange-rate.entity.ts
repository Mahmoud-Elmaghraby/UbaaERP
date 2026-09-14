/**
 * Exchange rate (claude/multi-currency-strategy.md, Phase 1). A quoted
 * conversion rate from one ISO 4217 currency to another, effective as of
 * a given date. See migration 0072's comment for why this is an
 * append-only ledger of quotes rather than a mutable "current rate" row:
 * a correction is a new, more recent row, never an edit of an old one —
 * there is deliberately no UpdateExchangeRateInput.
 */
export type ExchangeRateSource = 'manual' | 'api';

export interface ExchangeRate {
  id: string;
  fromCurrency: string;
  toCurrency: string;
  /** NUMERIC(18,6) — string in/out, same convention as TaxRulesTable.rate. Units of `toCurrency` per 1 `fromCurrency`. */
  rate: string;
  /** DATE — string in/out (e.g. "2026-09-12"), same convention as SalesInvoice.invoiceDate. */
  rateDate: string;
  source: ExchangeRateSource;
  createdAt: Date;
}

export interface CreateExchangeRateInput {
  fromCurrency: string;
  toCurrency: string;
  rate: string;
  rateDate: string;
  /** Defaults to 'manual' — the only source a human can create through the API. Phase 2's live-rate fetch job writes 'api' rows directly through the repository, not through this input. */
  source?: ExchangeRateSource;
}

export interface ExchangeRateFilters {
  fromCurrency?: string;
  toCurrency?: string;
}

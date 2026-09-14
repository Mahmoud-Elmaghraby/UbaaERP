import { Injectable, Logger } from '@nestjs/common';
import type { ExchangeRateProvider, ExchangeRateQuote } from '../../application/ports/exchange-rate-provider';

/**
 * frankfurter.dev v2 client (claude/multi-currency-strategy.md §3.7 —
 * Phase 2, confirmed by the user 2026-09-13). Free, no API key, one
 * endpoint per currency pair:
 *
 *   GET /v2/rate/{base}/{quote}
 *   -> {"date":"2026-09-13","base":"USD","quote":"EGP","rate":51.341}
 *
 * verified directly against the live API before this was written.
 *
 * v1 (frankfurter.app / api.frankfurter.app) was the originally
 * confirmed source (strategy doc §5) but turned out not to support EGP
 * at all — confirmed via a GitHub issue on the frankfurter repo: it only
 * ever covered the 31 ECB reference currencies, and EGP wasn't even on
 * that project's own list of requested-but-missing ones. v2 replaced the
 * single-source model with a blend of several official providers, one of
 * which is a dedicated "cbe" (Central Bank of Egypt) provider that does
 * cover EGP. This client deliberately does NOT pin a `providers` query
 * param, so it always gets whatever v2's default blend resolves to for
 * the requested pair (cbe for EGP, ecb for most others) rather than
 * hardcoding a source name that might be wrong for a different pair.
 *
 * Base URL is overridable via FRANKFURTER_API_BASE_URL (same "env var
 * with a hardcoded default" convention as minio-client.provider.ts)
 * purely so tests / a self-hosted mirror can point elsewhere — there is
 * no key or secret to configure.
 *
 * Never throws: a network failure, a non-2xx response, or a response
 * missing a usable rate all resolve to null (see ExchangeRateProvider's
 * own doc comment for why) — this is Accounting's boundary with the
 * outside world, not a place to let an unhandled exception escape into
 * ExchangeRateSyncService.
 */
@Injectable()
export class FrankfurterExchangeRateProvider implements ExchangeRateProvider {
  private readonly logger = new Logger(FrankfurterExchangeRateProvider.name);
  private readonly baseUrl = process.env.FRANKFURTER_API_BASE_URL ?? 'https://api.frankfurter.dev/v2';

  async getLatestRate(fromCurrency: string, toCurrency: string): Promise<ExchangeRateQuote | null> {
    const url = `${this.baseUrl}/rate/${encodeURIComponent(fromCurrency)}/${encodeURIComponent(toCurrency)}`;

    let response: Response;
    try {
      response = await fetch(url);
    } catch (err) {
      this.logger.warn(`Frankfurter request failed for ${fromCurrency}->${toCurrency}: ${(err as Error).message}`);
      return null;
    }

    if (!response.ok) {
      this.logger.warn(`Frankfurter returned HTTP ${response.status} for ${fromCurrency}->${toCurrency}`);
      return null;
    }

    let body: { date?: unknown; rate?: unknown };
    try {
      body = (await response.json()) as { date?: unknown; rate?: unknown };
    } catch (err) {
      this.logger.warn(
        `Frankfurter returned invalid JSON for ${fromCurrency}->${toCurrency}: ${(err as Error).message}`,
      );
      return null;
    }

    if (typeof body.rate !== 'number' || !Number.isFinite(body.rate) || body.rate <= 0 || typeof body.date !== 'string') {
      this.logger.warn(`Frankfurter response missing a usable rate for ${fromCurrency}->${toCurrency}`);
      return null;
    }

    return { rate: String(body.rate), rateDate: body.date };
  }
}

import { Inject, Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import { Money } from '@erp-platform/shared-kernel';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import { EXCHANGE_RATE_REPOSITORY, type ExchangeRateRepository } from '../ports/exchange-rate.repository';
import type { ExchangeRateSource } from '../../domain/exchange-rate.entity';
import { BusinessRuleError } from '../errors';

export interface CurrencyConversionResult {
  /** The input amount restated in `toCurrency`. */
  convertedAmount: Money;
  /** The rate actually used (toCurrency units per 1 fromCurrency unit), as a decimal string. "1" when no conversion was needed. */
  rateUsed: string;
  /** The exchange_rates row's own rate_date — may be earlier than asOfDate if that's the most recent quote on record. Equal to asOfDate when no conversion was needed. */
  rateDate: string;
  rateSource: ExchangeRateSource;
}

/**
 * Converts a Money value from its own currency into another currency
 * (claude/multi-currency-strategy.md §4.1). Deliberately NOT a method on
 * Money itself — Money stays the minimal value object it was designed to
 * be (see money.ts's own header comment); this service owns the
 * decision of *which* rate to use (via ExchangeRateRepository) and hands
 * Money only the arithmetic it already knows how to do.
 *
 * This is Phase 1 (claude/multi-currency-strategy.md §6) — built and
 * unit-testable now; Phase 3 (§10) is what wires
 * AccountingAutoPostingListeners to actually call convert() instead of
 * silently treating a foreign-currency amount as if it were the tenant's
 * own currency (the critical finding in that doc's §1).
 *
 * Precision note (fixed 2026-09-13, caught by Phase 3's first-ever unit
 * test for this service): the original implementation converted via
 * `Number(minorUnits) * Number(rate)`, which is exactly the
 * floating-point monetary arithmetic CLAUDE.md §3 (shared kernel) forbids
 * — e.g. 100 * 1.005 evaluates to 100.49999999999999 in IEEE 754, rounding
 * DOWN to 100 instead of the mathematically correct 101. Since the
 * exchange rate is always available as an exact decimal string (never a
 * pre-rounded float), conversion is now done with exact BigInt fixed-point
 * arithmetic instead: the rate string is parsed into an integer numerator
 * plus a decimal scale, multiplied against the integer minor units, and
 * rounded to the nearest minor unit (half rounds away from zero) using
 * integer division only — no float ever enters the calculation. This is
 * unrelated to Money.multiplyByQuantity()'s float-based rounding (which
 * stays as-is — that method multiplies by a physical quantity, e.g. 3.5
 * kg, which is inherently a float input; an exchange rate is not).
 */
@Injectable()
export class CurrencyConversionService {
  constructor(@Inject(EXCHANGE_RATE_REPOSITORY) private readonly rates: ExchangeRateRepository) {}

  async convert(
    db: Kysely<TenantDatabase>,
    amount: Money,
    toCurrency: string,
    asOfDate: string,
  ): Promise<CurrencyConversionResult> {
    if (amount.currency === toCurrency) {
      return { convertedAmount: amount, rateUsed: '1', rateDate: asOfDate, rateSource: 'manual' };
    }

    const effective = await this.rates.findEffectiveRate(db, amount.currency, toCurrency, asOfDate);
    if (!effective) {
      throw new BusinessRuleError(
        `No exchange rate is available to convert ${amount.currency} to ${toCurrency} as of ${asOfDate}.`,
        {
          code: 'EXCHANGE_RATE.NOT_AVAILABLE',
          params: { from: amount.currency, to: toCurrency, date: asOfDate },
        },
      );
    }

    const convertedMinorUnits = CurrencyConversionService.applyRate(amount.toMinorUnits(), effective.rate);
    const convertedAmount = Money.fromMinorUnits(convertedMinorUnits, toCurrency);

    return {
      convertedAmount,
      rateUsed: effective.rate,
      rateDate: effective.rateDate,
      rateSource: effective.source,
    };
  }

  /**
   * Multiplies an integer minor-units amount by a decimal exchange-rate
   * string using exact BigInt fixed-point arithmetic — see the class
   * doc comment above for why this replaced a float-based calculation.
   * Rounds half away from zero, matching Math.round()'s behavior for
   * positive values without ever going through a floating-point number.
   */
  private static applyRate(minorUnits: bigint, rate: string): bigint {
    const negative = minorUnits < 0n;
    const absMinorUnits = negative ? -minorUnits : minorUnits;

    const [wholePart, fractionPart = ''] = rate.split('.');
    const scale = fractionPart.length;
    const rateNumerator = BigInt(`${wholePart}${fractionPart}`);
    const divisor = 10n ** BigInt(scale);
    const halfDivisor = divisor / 2n;

    const roundedAbs = (absMinorUnits * rateNumerator + halfDivisor) / divisor;
    return negative ? -roundedAbs : roundedAbs;
  }
}

/**
 * Money Value Object (CLAUDE.md §2.5 / master doc §4 [مستقر]).
 *
 * Locked shape (agreed before this file existed): integer minor units
 * (e.g. qirsh/cents) + an ISO 4217 currency code. Never a floating-point
 * number for a monetary business value — this class is the only legal
 * representation of money in domain/application code from here on.
 *
 * First real consumer: Inventory's weighted-average stock valuation
 * (KyselyStockLevelRepository / StockMovementsService), which needed a
 * concrete API rather than the placeholder that used to live in
 * index.ts. Kept intentionally minimal — just what Inventory needs
 * (construct, add, subtract, multiply/divide by a quantity, compare) —
 * so Sales/Purchases/Accounting can extend it later without having to
 * rework the shape.
 */
export class InvalidMoneyOperationError extends Error {}

const ISO_CURRENCY_CODE_PATTERN = /^[A-Z]{3}$/;

export type MoneyRoundingMode = 'round' | 'floor' | 'ceil';

function applyRounding(value: number, rounding: MoneyRoundingMode): number {
  switch (rounding) {
    case 'floor':
      return Math.floor(value);
    case 'ceil':
      return Math.ceil(value);
    case 'round':
    default:
      return Math.round(value);
  }
}

export class Money {
  private constructor(
    private readonly minorUnits: bigint,
    public readonly currency: string,
  ) {}

  static fromMinorUnits(minorUnits: number | bigint, currency: string): Money {
    if (!ISO_CURRENCY_CODE_PATTERN.test(currency)) {
      throw new InvalidMoneyOperationError(
        `Invalid ISO 4217 currency code "${currency}": expected three uppercase letters.`,
      );
    }
    if (typeof minorUnits === 'number' && !Number.isInteger(minorUnits)) {
      throw new InvalidMoneyOperationError(
        'Money minor units must be an integer — never a fractional/float amount.',
      );
    }
    return new Money(typeof minorUnits === 'bigint' ? minorUnits : BigInt(minorUnits), currency);
  }

  static zero(currency: string): Money {
    return Money.fromMinorUnits(0, currency);
  }

  toMinorUnits(): bigint {
    return this.minorUnits;
  }

  /** Decimal string for display only (e.g. "12.50") — never parse this back for arithmetic. */
  toDecimalString(decimals = 2): string {
    const negative = this.minorUnits < 0n;
    const abs = negative ? -this.minorUnits : this.minorUnits;
    const factor = 10n ** BigInt(decimals);
    const whole = abs / factor;
    const fraction = (abs % factor).toString().padStart(decimals, '0');
    return `${negative ? '-' : ''}${whole.toString()}${decimals > 0 ? `.${fraction}` : ''}`;
  }

  private assertSameCurrency(other: Money): void {
    if (other.currency !== this.currency) {
      throw new InvalidMoneyOperationError(
        `Cannot operate on different currencies: "${this.currency}" vs "${other.currency}".`,
      );
    }
  }

  add(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money(this.minorUnits + other.minorUnits, this.currency);
  }

  subtract(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money(this.minorUnits - other.minorUnits, this.currency);
  }

  /** e.g. unit cost × quantity received. Rounds to the nearest minor unit by default. */
  multiplyByQuantity(quantity: number, rounding: MoneyRoundingMode = 'round'): Money {
    if (!Number.isFinite(quantity)) {
      throw new InvalidMoneyOperationError('Quantity must be a finite number.');
    }
    return new Money(BigInt(applyRounding(Number(this.minorUnits) * quantity, rounding)), this.currency);
  }

  /** e.g. total stock value ÷ quantity on hand, for weighted-average unit cost. */
  divideByQuantity(quantity: number, rounding: MoneyRoundingMode = 'round'): Money {
    if (!Number.isFinite(quantity) || quantity === 0) {
      throw new InvalidMoneyOperationError('Cannot divide a monetary amount by zero or a non-finite quantity.');
    }
    return new Money(BigInt(applyRounding(Number(this.minorUnits) / quantity, rounding)), this.currency);
  }

  isZero(): boolean {
    return this.minorUnits === 0n;
  }

  isNegative(): boolean {
    return this.minorUnits < 0n;
  }

  isPositive(): boolean {
    return this.minorUnits > 0n;
  }

  equals(other: Money): boolean {
    return this.currency === other.currency && this.minorUnits === other.minorUnits;
  }

  compareTo(other: Money): -1 | 0 | 1 {
    this.assertSameCurrency(other);
    if (this.minorUnits === other.minorUnits) return 0;
    return this.minorUnits > other.minorUnits ? 1 : -1;
  }

  greaterThan(other: Money): boolean {
    return this.compareTo(other) > 0;
  }

  lessThan(other: Money): boolean {
    return this.compareTo(other) < 0;
  }
}

import { Money } from '@erp-platform/shared-kernel';

/** value × part / whole in minor units, rounded half away from zero (part ≤ whole; value may be negative). */
export function moneyShare(value: Money, part: number, whole: number): Money {
  const partScaled = BigInt(Math.round(part * 10_000));
  const wholeScaled = BigInt(Math.round(whole * 10_000));
  if (wholeScaled === 0n) return Money.zero(value.currency);
  const minor = value.toMinorUnits();
  const abs = minor < 0n ? -minor : minor;
  const rounded = (abs * partScaled * 2n + wholeScaled) / (wholeScaled * 2n);
  return Money.fromMinorUnits(minor < 0n ? -rounded : rounded, value.currency);
}

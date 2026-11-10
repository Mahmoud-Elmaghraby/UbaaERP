import { findPriceViolations, type PriceFloorInfo } from './sales-limits';
import { documentDateProblem } from '../../../shared/app-settings/document-date';

const floor = (over: Partial<PriceFloorInfo> = {}): PriceFloorInfo => ({
  productName: 'P',
  costMinor: 1000n,
  costCurrency: 'EGP',
  minMinor: 1200n,
  minCurrency: 'EGP',
  ...over,
});
const line = (netMinor: bigint, baseQuantity = 1, currency = 'EGP') => ({ lineId: 'l1', productVariantId: 'v1', netMinor, currency, baseQuantity });

describe('findPriceViolations', () => {
  it('compares the price per base unit with the minimum and the cost', () => {
    const floors = new Map([['v1', floor()]]);
    expect(findPriceViolations([line(1300n)], floors, { cost: true, min: true })).toEqual([]);
    expect(findPriceViolations([line(1100n)], floors, { cost: true, min: true }).map((v) => v.kind)).toEqual(['below_min']);
    expect(findPriceViolations([line(900n)], floors, { cost: true, min: true }).map((v) => v.kind)).toEqual(['below_min', 'below_cost']);
  });

  it('divides by the base quantity (a box of 12)', () => {
    const floors = new Map([['v1', floor()]]);
    // 12 × 10.00 = 120.00 for a box → 10.00 a piece, the cost exactly: fine for cost, below the 12.00 minimum.
    const result = findPriceViolations([line(12_000n, 12)], floors, { cost: true, min: true });
    expect(result.map((v) => v.kind)).toEqual(['below_min']);
    expect(result[0]!.unitNetMinor).toBe(1000n);
  });

  it('checks only what the settings ask for, and skips other currencies and unknown costs', () => {
    expect(findPriceViolations([line(900n)], new Map([['v1', floor()]]), { cost: true, min: false }).map((v) => v.kind)).toEqual(['below_cost']);
    expect(findPriceViolations([line(900n, 1, 'USD')], new Map([['v1', floor()]]), { cost: true, min: true })).toEqual([]);
    expect(findPriceViolations([line(0n)], new Map([['v1', floor({ costMinor: null, minMinor: null })]]), { cost: true, min: true })).toEqual([]);
  });
});

describe('documentDateProblem', () => {
  const today = '2026-11-09';
  it('allows any past date without a limit, and limits it when set', () => {
    expect(documentDateProblem('2020-01-01', today, { backdateDays: null, allowFutureDates: true })).toBeNull();
    expect(documentDateProblem('2026-11-02', today, { backdateDays: 7, allowFutureDates: true })).toBeNull();
    expect(documentDateProblem('2026-11-01', today, { backdateDays: 7, allowFutureDates: true })).toEqual({ kind: 'too_old', maxDays: 7 });
    expect(documentDateProblem('2026-11-08', today, { backdateDays: 0, allowFutureDates: true })).toEqual({ kind: 'too_old', maxDays: 0 });
  });
  it('refuses a future date only when future dates are off', () => {
    expect(documentDateProblem('2026-11-10', today, { backdateDays: 0, allowFutureDates: true })).toBeNull();
    expect(documentDateProblem('2026-11-10', today, { backdateDays: null, allowFutureDates: false })).toEqual({ kind: 'future' });
  });
});

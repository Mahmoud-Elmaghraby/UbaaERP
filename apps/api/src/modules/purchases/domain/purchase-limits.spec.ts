import { findPriceIncreases, withTolerance } from './purchase-limits';

const line = (netMinor: bigint, baseQuantity = 1, currency = 'EGP') => ({ lineId: 'l1', productVariantId: 'v1', netMinor, currency, baseQuantity });
const last = new Map([['v1', [{ unitMinor: 1000n, currency: 'EGP', documentNumber: 'PI-1' }]]]);

describe('findPriceIncreases', () => {
  it('flags a price above the last one by more than the tolerance', () => {
    expect(findPriceIncreases([line(1050n)], last, 5)).toEqual([]);
    expect(findPriceIncreases([line(1060n)], last, 5)).toEqual([
      expect.objectContaining({ unitMinor: 1060n, lastMinor: 1000n, increasePercent: 6, lastDocument: 'PI-1' }),
    ]);
  });
  it('compares per base unit, and only in the same currency', () => {
    expect(findPriceIncreases([line(12_600n, 12)], last, 0).map((i) => i.unitMinor)).toEqual([1050n]);
    expect(findPriceIncreases([line(5000n, 1, 'USD')], last, 0)).toEqual([]);
    expect(findPriceIncreases([{ ...line(5000n), productVariantId: 'never-bought' }], last, 0)).toEqual([]);
  });
});

describe('withTolerance', () => {
  it('raises the ordered quantity by the tolerance', () => {
    expect(withTolerance(100, 0)).toBe(100);
    expect(withTolerance(100, 5)).toBe(105);
    expect(withTolerance(3, 10)).toBe(3.3);
  });
});

import { ean13CheckDigit } from './product-codes.service';

describe('ean13CheckDigit', () => {
  it.each([
    ['400638133393', 1], // 4006381333931 — a well-known valid EAN-13
    ['590123412345', 7], // 5901234123457
    ['200000000001', 5], // 2·1 + 1·3 = 5 → 10 − 5
  ])('computes the check digit of %s', (first12, expected) => {
    expect(ean13CheckDigit(first12)).toBe(expected);
  });
});

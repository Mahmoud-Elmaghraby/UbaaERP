import { breakdownFromTaxes, computeLineTaxes, percentOf, rateToMilli, sumTaxBreakdowns, type TaxRateInput } from './tax-calculator';

const VAT14: TaxRateInput = { taxRuleId: 'vat', name: 'VAT 14%', kind: 'vat', rate: '14', etaType: 'T1', etaSubtype: 'V009' };
const TABLE8: TaxRateInput = { taxRuleId: 'tbl', name: 'Table 8%', kind: 'table', rate: '8', etaType: 'T2', etaSubtype: 'Tbl01' };
const WHT1: TaxRateInput = { taxRuleId: 'wht', name: 'WHT 1%', kind: 'withholding', rate: '1', etaType: 'T4', etaSubtype: 'W010' };

describe('tax calculator', () => {
  it('parses rates exactly', () => {
    expect(rateToMilli('14')).toBe(14000n);
    expect(rateToMilli(0.5)).toBe(500n);
    expect(rateToMilli('14.000')).toBe(14000n);
    expect(() => rateToMilli('-1')).toThrow();
    expect(() => rateToMilli('101')).toThrow();
  });

  it('rounds half away from zero per line', () => {
    expect(percentOf(1250n, '14')).toBe(175n);
    expect(percentOf(1n, '50')).toBe(1n); // 0.5 → 1
    expect(percentOf(3n, '14')).toBe(0n); // 0.42 → 0
  });

  it('VAT on net: 10 × 100.00 = 1,000.00 → 140.00 (the ETA example)', () => {
    const line = computeLineTaxes(100_000n, [VAT14]);
    expect(line).toMatchObject({ net: 100_000n, vat: 14_000n, table: 0n, withholding: 0n, total: 114_000n });
    expect(line.taxes[0]).toMatchObject({ rate: '14.000', base: 100_000n, amount: 14_000n, etaType: 'T1', etaSubtype: 'V009' });
  });

  it('table tax is part of the VAT base; withholding comes off the net and reduces the total', () => {
    const line = computeLineTaxes(100_000n, [WHT1, VAT14, TABLE8]);
    // table 8% = 80.00; VAT 14% of 1,080.00 = 151.20; WHT 1% of 1,000 = 10.00
    expect(line).toMatchObject({ net: 100_000n, table: 8_000n, vat: 15_120n, withholding: 1_000n, total: 122_120n });
  });

  it('prices including tax back out the net and keep the shelf price exact', () => {
    for (const gross of [1_000n, 999n, 11_400n, 123_457n, 1n]) {
      const line = computeLineTaxes(gross, [VAT14], { pricesIncludeTax: true });
      expect(line.net + line.vat).toBe(gross);
      expect(line.total).toBe(gross);
    }
    expect(computeLineTaxes(11_400n, [VAT14], { pricesIncludeTax: true })).toMatchObject({ net: 10_000n, vat: 1_400n });
  });

  it('no taxes = net is the total; documents sum their lines', () => {
    const a = computeLineTaxes(5_000n, []);
    const b = computeLineTaxes(10_000n, [VAT14]);
    expect(sumTaxBreakdowns([a, b])).toEqual({ net: 15_000n, table: 0n, vat: 1_400n, withholding: 0n, total: 16_400n });
    expect(breakdownFromTaxes(10_000n, b.taxes)).toEqual({ net: 10_000n, table: 0n, vat: 1_400n, withholding: 0n, total: 11_400n });
  });
});

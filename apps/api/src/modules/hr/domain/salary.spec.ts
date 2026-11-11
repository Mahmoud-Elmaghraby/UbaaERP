import { Money } from '@erp-platform/shared-kernel';
import { computeSalary, normaliseLineValue } from './salary';

const egp = (minor: number) => Money.fromMinorUnits(minor, 'EGP');

describe('computeSalary', () => {
  it('adds fixed and percentage earnings, subtracts deductions', () => {
    const result = computeSalary(egp(1_000_000), [
      { componentId: 'housing', kind: 'earning', calculation: 'percent_of_basic', amount: null, percent: 12.5 },
      { componentId: 'transport', kind: 'earning', calculation: 'fixed', amount: egp(50_000), percent: null },
      { componentId: 'union', kind: 'deduction', calculation: 'fixed', amount: egp(2_500), percent: null },
    ]);
    expect(result.lines.map((l) => l.value.toMinorUnits())).toEqual([125_000n, 50_000n, 2_500n]);
    expect(result.earnings.toMinorUnits()).toBe(175_000n);
    expect(result.deductions.toMinorUnits()).toBe(2_500n);
    expect(result.gross.toMinorUnits()).toBe(1_175_000n);
    expect(result.net.toMinorUnits()).toBe(1_172_500n);
  });

  it('rounds a percentage to the nearest minor unit', () => {
    const result = computeSalary(egp(333_333), [
      { componentId: 'x', kind: 'earning', calculation: 'percent_of_basic', amount: null, percent: 10 },
    ]);
    expect(result.lines[0]!.value.toMinorUnits()).toBe(33_333n);
  });

  it('never goes below zero and handles no components', () => {
    expect(computeSalary(egp(1000), []).net.toMinorUnits()).toBe(1000n);
    const over = computeSalary(egp(1000), [{ componentId: 'd', kind: 'deduction', calculation: 'fixed', amount: egp(5000), percent: null }]);
    expect(over.net.toMinorUnits()).toBe(0n);
  });
});

describe('normaliseLineValue', () => {
  it('keeps one kind of value and falls back to the defaults', () => {
    expect(normaliseLineValue('fixed', { amount: null, percent: 5 }, { amount: 700n, percent: null })).toEqual({ amount: 700n, percent: null });
    expect(normaliseLineValue('percent_of_basic', { amount: 10n, percent: null }, { amount: null, percent: 15 })).toEqual({ amount: null, percent: 15 });
    expect(normaliseLineValue('fixed', { amount: 0n, percent: null }, { amount: 700n, percent: null })).toEqual({ amount: 0n, percent: null });
    expect(normaliseLineValue('percent_of_basic', { amount: null, percent: null }, { amount: null, percent: null })).toEqual({ amount: null, percent: 0 });
  });
});

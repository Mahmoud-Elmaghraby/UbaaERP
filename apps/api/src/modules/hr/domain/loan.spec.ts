import { BusinessRuleError } from '../../../shared/errors/domain-errors';
import { addMonths, allocatePayment, buildSchedule } from './loan';

describe('loan schedule', () => {
  it('splits by count with the remainder on the last installment, across a year end', () => {
    const s = buildSchedule(100_000n, { count: 3 }, '2026-11');
    expect(s.map((x) => [x.month, x.amount])).toEqual([
      ['2026-11-01', 33_333n],
      ['2026-12-01', 33_333n],
      ['2027-01-01', 33_334n],
    ]);
  });

  it('splits by a fixed installment, the last one taking what is left', () => {
    expect(buildSchedule(250_000n, { perInstallment: 100_000n }, '2026-01').map((x) => x.amount)).toEqual([100_000n, 100_000n, 50_000n]);
  });

  it('refuses impossible schedules', () => {
    expect(() => buildSchedule(2n, { count: 3 }, '2026-01')).toThrow(BusinessRuleError);
    expect(() => buildSchedule(1_000_000n, { perInstallment: 1n }, '2026-01')).toThrow(BusinessRuleError);
    expect(() => buildSchedule(100n, { count: 0 }, '2026-01')).toThrow(BusinessRuleError);
  });

  it('adds months', () => {
    expect(addMonths('2026-12-01', 1)).toBe('2027-01-01');
    expect(addMonths('2026-01-01', 23)).toBe('2027-12-01');
  });
});

describe('allocatePayment', () => {
  const inst = [
    { id: 'a', amount: 100n, paid: 100n },
    { id: 'b', amount: 100n, paid: 40n },
    { id: 'c', amount: 100n, paid: 0n },
  ];

  it('pays the oldest open installments first', () => {
    expect(allocatePayment(inst, 90n)).toEqual([
      { id: 'b', add: 60n },
      { id: 'c', add: 30n },
    ]);
  });

  it('refuses more than what is owed', () => {
    expect(() => allocatePayment(inst, 161n)).toThrow(/more than what is left/);
    expect(allocatePayment(inst, 160n)).toHaveLength(2);
  });
});

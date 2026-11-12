import { BusinessRuleError } from '../../../shared/errors/domain-errors';
import type { ShiftRule } from './attendance';
import { assertFits, available, carryOver, countLeaveDays } from './leave';

const shift: ShiftRule = { startMinute: 540, endMinute: 1020, graceMinutes: 15, breakMinutes: 0, weeklyOffDays: [5, 6] };

describe('leave days', () => {
  it('skips weekly days off and public holidays', () => {
    // Sun 2026-03-01 … Sat 2026-03-07; Fri+Sat off; Tue holiday → Sun, Mon, Wed, Thu
    expect(countLeaveDays('2026-03-01', '2026-03-07', false, shift, new Set(['2026-03-03']))).toBe(4);
  });

  it('counts a half day, and nothing on a day off', () => {
    expect(countLeaveDays('2026-03-02', '2026-03-02', true, shift, new Set())).toBe(0.5);
    expect(countLeaveDays('2026-03-06', '2026-03-06', true, shift, new Set())).toBe(0);
  });
});

describe('balances', () => {
  const b = { entitled: 21, carriedOver: 3, adjustment: -1, used: 10, pending: 2.5 };

  it('computes what is left and what carries over', () => {
    expect(available(b)).toBe(10.5);
    expect(carryOver(b, 5)).toBe(5);
    expect(carryOver(b, 30)).toBe(13);
    expect(carryOver({ ...b, used: 40 }, 5)).toBe(0);
  });

  it('refuses a request bigger than the balance', () => {
    expect(() => assertFits(11, 10.5, 'اعتيادي')).toThrow(BusinessRuleError);
    expect(() => assertFits(10.5, 10.5, 'اعتيادي')).not.toThrow();
  });
});

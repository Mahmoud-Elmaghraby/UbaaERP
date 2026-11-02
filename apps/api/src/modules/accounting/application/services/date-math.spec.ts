import { addMonthsClamped, daysInMonth, monthEnd, monthEndsBetween, previousMonthEnd } from './date-math';

describe('date-math', () => {
  it('clamps the day to the target month', () => {
    expect(addMonthsClamped('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonthsClamped('2028-01-31', 1)).toBe('2028-02-29');
    expect(addMonthsClamped('2026-11-15', 3)).toBe('2027-02-15');
    expect(addMonthsClamped('2026-03-31', -1)).toBe('2026-02-28');
  });

  it('knows month ends', () => {
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(monthEnd('2026-04-10')).toBe('2026-04-30');
    expect(previousMonthEnd('2026-01-05')).toBe('2025-12-31');
    expect(previousMonthEnd('2026-03-31')).toBe('2026-02-28');
  });

  it('lists month ends inclusively', () => {
    expect(monthEndsBetween('2026-11-20', '2027-02-01')).toEqual(['2026-11-30', '2026-12-31', '2027-01-31', '2027-02-28']);
    expect(monthEndsBetween('2026-05-01', '2026-04-30')).toEqual([]);
  });
});

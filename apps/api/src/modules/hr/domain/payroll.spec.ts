import { Money } from '@erp-platform/shared-kernel';
import { computePayroll, dayRateDivisor, type PayrollInput, type PayrollRules } from './payroll';

const egp = (pounds: number) => Money.fromMinorUnits(Math.round(pounds * 100), 'EGP');
const rules: PayrollRules = { dayRateBasis: 'days30', absenceDeductionDays: 1, monthlyLateAllowanceMinutes: 60, overtimeMultiplier: 1.5 };

function input(over: Partial<PayrollInput> = {}): PayrollInput {
  return {
    currency: 'EGP',
    basic: egp(9000),
    allowances: egp(0),
    componentDeductions: egp(0),
    proration: 1,
    workingDaysInMonth: 26,
    scheduledMinutesPerDay: 480,
    absentDays: 0,
    lateMinutes: 0,
    overtimeMinutes: 0,
    unpaidLeaveDays: 0,
    bonuses: [],
    penalties: [],
    loanDue: egp(0),
    overrides: {},
    manualAdjustment: egp(0),
    ...over,
  };
}

describe('computePayroll', () => {
  it('pays a clean month in full', () => {
    const r = computePayroll(input({ allowances: egp(1000), componentDeductions: egp(100) }), rules);
    expect(r.gross.toDecimalString()).toBe('10000.00');
    expect(r.net.toDecimalString()).toBe('9900.00');
    expect(r.expense.toDecimalString()).toBe('9900.00');
    expect(r.dayRate.toDecimalString()).toBe('333.33');
    expect(r.warnings).toEqual([]);
  });

  it('values absence, lateness after the allowance, overtime, unpaid leave and day-based items', () => {
    // day = 9000/30 = 300; hour = 37.50
    const r = computePayroll(
      input({
        absentDays: 2,
        lateMinutes: 90, // 30 chargeable
        overtimeMinutes: 120,
        unpaidLeaveDays: 1,
        bonuses: [{ amount: egp(500), days: null }],
        penalties: [{ amount: null, days: 0.5 }],
      }),
      { ...rules, absenceDeductionDays: 2 },
    );
    expect(r.absence.toDecimalString()).toBe('1200.00'); // 2 days × 2 × 300
    expect(r.chargeableLateMinutes).toBe(30);
    expect(r.late.toDecimalString()).toBe('18.75');
    expect(r.overtime.toDecimalString()).toBe('112.50'); // 2h × 37.5 × 1.5
    expect(r.unpaidLeave.toDecimalString()).toBe('300.00');
    expect(r.penalties.toDecimalString()).toBe('150.00');
    expect(r.gross.toDecimalString()).toBe('9612.50');
    expect(r.net.toDecimalString()).toBe('7943.75');
  });

  it('prorates a partial month and lets HR override suggestions', () => {
    const r = computePayroll(input({ proration: 0.5, absentDays: 3, overrides: { absence: egp(0) } }), rules);
    expect(r.basic.toDecimalString()).toBe('4500.00');
    expect(r.absence.isZero()).toBe(true);
    expect(r.warnings).toContain('PARTIAL_MONTH');
  });

  it('shrinks the loan installment before the pay goes negative', () => {
    const r = computePayroll(input({ absentDays: 25, loanDue: egp(3000) }), rules);
    expect(r.expense.toDecimalString()).toBe('1500.00');
    expect(r.loan.toDecimalString()).toBe('1500.00');
    expect(r.net.isZero()).toBe(true);
    expect(r.warnings).toContain('LOAN_REDUCED');
  });

  it('caps deductions at what the month pays, and keeps the books balanced', () => {
    const r = computePayroll(input({ absentDays: 40, manualAdjustment: egp(-100) }), rules);
    expect(r.warnings).toContain('DEDUCTIONS_CAPPED');
    expect(r.net.isNegative()).toBe(false);
    const deductions = [r.componentDeductions, r.absence, r.late, r.unpaidLeave, r.penalties].reduce((s, m) => s.add(m), egp(0)).subtract(r.manualAdjustment);
    expect(r.gross.subtract(deductions).toMinorUnits()).toBe(r.expense.toMinorUnits());
    expect(r.expense.subtract(r.loan).toMinorUnits()).toBe(r.net.toMinorUnits());
  });

  it('adds a positive hand adjustment', () => {
    expect(computePayroll(input({ manualAdjustment: egp(250) }), rules).net.toDecimalString()).toBe('9250.00');
  });

  it('has the three day-rate bases', () => {
    expect(dayRateDivisor('days30', 22)).toBe(30);
    expect(dayRateDivisor('days26', 22)).toBe(26);
    expect(dayRateDivisor('workingDays', 22)).toBe(22);
  });
});

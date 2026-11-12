import { Money } from '@erp-platform/shared-kernel';

export type DayRateBasis = 'days30' | 'days26' | 'workingDays';

export interface PayrollRules {
  dayRateBasis: DayRateBasis;
  /** Days of pay taken per day of absence (1 = a day for a day). */
  absenceDeductionDays: number;
  /** Late + early-leave minutes forgiven per month before anything is deducted. */
  monthlyLateAllowanceMinutes: number;
  overtimeMultiplier: number;
}

export interface PayrollInput {
  currency: string;
  /** The salary in force (a full month). */
  basic: Money;
  allowances: Money;
  componentDeductions: Money;
  /** Days the employee was employed this month ÷ calendar days (1 for a full month). */
  proration: number;
  /** Working days of the month on the employee's shift (for the 'workingDays' basis). */
  workingDaysInMonth: number;
  /** The employee's scheduled minutes per day (hour rate = day rate ÷ hours). */
  scheduledMinutesPerDay: number;
  absentDays: number;
  lateMinutes: number;
  overtimeMinutes: number;
  /** Unpaid share of leave days: days × (1 − pay%). */
  unpaidLeaveDays: number;
  bonuses: { amount: Money | null; days: number | null }[];
  penalties: { amount: Money | null; days: number | null }[];
  /** Open loan installments due up to this month. */
  loanDue: Money;
  overrides: { absence?: Money; late?: Money; overtime?: Money };
  manualAdjustment: Money;
}

export interface PayrollResult {
  basic: Money;
  allowances: Money;
  overtime: Money;
  bonuses: Money;
  gross: Money;
  componentDeductions: Money;
  absence: Money;
  late: Money;
  unpaidLeave: Money;
  penalties: Money;
  loan: Money;
  manualAdjustment: Money;
  net: Money;
  /** Salary cost for the books: gross − pay deductions (= net + loan). */
  expense: Money;
  dayRate: Money;
  hourRate: Money;
  chargeableLateMinutes: number;
  warnings: string[];
}

/** Divisor turning a monthly salary into a day's pay. */
export function dayRateDivisor(basis: DayRateBasis, workingDaysInMonth: number): number {
  if (basis === 'days26') return 26;
  if (basis === 'workingDays') return Math.max(1, workingDaysInMonth);
  return 30;
}

/**
 * One employee's month (pure, Money VO). Day rate = (basic + allowances) ÷ divisor; hour rate =
 * day rate ÷ scheduled hours. Absence, lateness and overtime are suggestions unless overridden.
 * Deductions never take the pay below zero: the loan installment shrinks first, then the pay
 * deductions are capped at gross — each cap is reported as a warning. In the books
 * (posting): Dr salaries expense = net + loan, Cr employee advances = loan, Cr salaries payable = net.
 */
export function computePayroll(input: PayrollInput, rules: PayrollRules): PayrollResult {
  const zero = Money.zero(input.currency);
  const warnings: string[] = [];
  const monthly = input.basic.add(input.allowances);
  const dayRate = monthly.divideByQuantity(dayRateDivisor(rules.dayRateBasis, input.workingDaysInMonth));
  const hours = Math.max(1, input.scheduledMinutesPerDay) / 60;
  const hourRate = dayRate.divideByQuantity(hours);
  const perMinute = (minutes: number) => hourRate.multiplyByQuantity(minutes / 60);
  const valued = (items: { amount: Money | null; days: number | null }[]) =>
    items.reduce((sum, i) => sum.add(i.amount ?? dayRate.multiplyByQuantity(i.days ?? 0)), zero);

  const basic = input.basic.multiplyByQuantity(input.proration);
  const allowances = input.allowances.multiplyByQuantity(input.proration);
  const componentDeductions = input.componentDeductions.multiplyByQuantity(input.proration);
  const chargeableLateMinutes = Math.max(0, input.lateMinutes - rules.monthlyLateAllowanceMinutes);
  const absence = input.overrides.absence ?? dayRate.multiplyByQuantity(input.absentDays * rules.absenceDeductionDays);
  const late = input.overrides.late ?? perMinute(chargeableLateMinutes);
  const overtime = input.overrides.overtime ?? perMinute(input.overtimeMinutes).multiplyByQuantity(rules.overtimeMultiplier);
  const unpaidLeave = dayRate.multiplyByQuantity(input.unpaidLeaveDays);
  const bonuses = valued(input.bonuses);
  const penalties = valued(input.penalties);

  const gross = basic.add(allowances).add(overtime).add(bonuses);
  // A positive hand adjustment pays more; a negative one is one more deduction.
  const extraPay = input.manualAdjustment.isNegative() ? zero : input.manualAdjustment;
  const payable = gross.add(extraPay);
  let items = {
    componentDeductions,
    absence,
    late,
    unpaidLeave,
    penalties,
    manualDeduction: input.manualAdjustment.isNegative() ? zero.subtract(input.manualAdjustment) : zero,
  };
  const sum = (x: typeof items) => Object.values(x).reduce((total, m) => total.add(m), zero);
  if (sum(items).greaterThan(payable)) {
    warnings.push('DEDUCTIONS_CAPPED');
    // Every pay deduction shrinks in proportion so together they equal what the month pays.
    const factor = Number(payable.toMinorUnits()) / Number(sum(items).toMinorUnits());
    items = Object.fromEntries(Object.entries(items).map(([k, m]) => [k, m.multiplyByQuantity(factor, 'floor')])) as typeof items;
  }
  const payDeductions = sum(items);
  const capped = items;
  const manualAdjustment = input.manualAdjustment.isNegative() ? zero.subtract(items.manualDeduction) : extraPay;
  const expense = payable.subtract(payDeductions);
  let loan = input.loanDue;
  if (loan.greaterThan(expense)) {
    warnings.push('LOAN_REDUCED');
    loan = expense;
  }
  const net = expense.subtract(loan);
  if (input.proration < 1) warnings.push('PARTIAL_MONTH');

  return {
    basic,
    allowances,
    overtime,
    bonuses,
    gross,
    componentDeductions: capped.componentDeductions,
    absence: capped.absence,
    late: capped.late,
    unpaidLeave: capped.unpaidLeave,
    penalties: capped.penalties,
    loan,
    manualAdjustment,
    net,
    expense,
    dayRate,
    hourRate,
    chargeableLateMinutes,
    warnings,
  };
}

import { Money } from '@erp-platform/shared-kernel';

export type SalaryComponentKind = 'earning' | 'deduction';
export type SalaryComponentCalculation = 'fixed' | 'percent_of_basic';

export interface SalaryLineInput {
  componentId: string;
  kind: SalaryComponentKind;
  calculation: SalaryComponentCalculation;
  /** Fixed components: the amount (minor units). */
  amount: Money | null;
  /** Percentage components: % of the basic salary. */
  percent: number | null;
}

export interface SalaryLineValue extends SalaryLineInput {
  value: Money;
}

export interface SalaryBreakdown {
  lines: SalaryLineValue[];
  earnings: Money;
  deductions: Money;
  /** Basic + earnings. */
  gross: Money;
  /** Gross − deductions, floored at zero (a salary can't be owed back by its own components). */
  net: Money;
}

/**
 * What a monthly salary comes to: each component's value (a fixed amount, or a % of the basic
 * rounded to the nearest minor unit), then the totals. Pure — no attendance, leave or one-off items;
 * the payroll run (a later step) starts from this.
 */
export function computeSalary(basic: Money, lines: readonly SalaryLineInput[]): SalaryBreakdown {
  const zero = Money.zero(basic.currency);
  let earnings = zero;
  let deductions = zero;
  const valued = lines.map((line) => {
    const value = line.calculation === 'fixed' ? (line.amount ?? zero) : basic.multiplyByQuantity((line.percent ?? 0) / 100);
    if (line.kind === 'earning') earnings = earnings.add(value);
    else deductions = deductions.add(value);
    return { ...line, value };
  });
  const gross = basic.add(earnings);
  const rawNet = gross.subtract(deductions);
  return { lines: valued, earnings, deductions, gross, net: rawNet.isNegative() ? zero : rawNet };
}

/**
 * The line a component contributes, from what the user entered: a fixed component keeps only an
 * amount, a percentage one only a percent. Missing → the component's default.
 */
export function normaliseLineValue(
  calculation: SalaryComponentCalculation,
  entered: { amount: bigint | null; percent: number | null },
  defaults: { amount: bigint | null; percent: number | null },
): { amount: bigint | null; percent: number | null } {
  if (calculation === 'fixed') return { amount: entered.amount ?? defaults.amount ?? 0n, percent: null };
  return { amount: null, percent: entered.percent ?? defaults.percent ?? 0 };
}

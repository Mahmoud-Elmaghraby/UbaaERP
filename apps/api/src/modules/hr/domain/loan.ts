import { BusinessRuleError } from '../../../shared/errors/domain-errors';

/** A pay month as its first day, 'YYYY-MM-01'. */
export function monthStart(month: string): string {
  return `${month.slice(0, 7)}-01`;
}

/** 'YYYY-MM-01' + n months. */
export function addMonths(monthDate: string, n: number): string {
  const [y, m] = monthDate.split('-').map(Number) as [number, number];
  const total = y * 12 + (m - 1) + n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}-01`;
}

/**
 * The monthly schedule of a loan (minor units): equal installments by count, the last one taking
 * the rounding remainder — or a fixed installment, the last one taking what's left.
 */
export function buildSchedule(amount: bigint, by: { count: number } | { perInstallment: bigint }, firstMonth: string): { month: string; amount: bigint }[] {
  const amounts: bigint[] = [];
  if ('count' in by) {
    if (by.count < 1 || by.count > 120) throw scheduleError();
    const base = amount / BigInt(by.count);
    if (base === 0n) throw scheduleError();
    for (let i = 0; i < by.count; i += 1) amounts.push(i === by.count - 1 ? amount - base * BigInt(by.count - 1) : base);
  } else {
    if (by.perInstallment <= 0n) throw scheduleError();
    let left = amount;
    while (left > 0n) {
      const next = left < by.perInstallment ? left : by.perInstallment;
      amounts.push(next);
      left -= next;
      if (amounts.length > 120) throw scheduleError();
    }
  }
  const start = monthStart(firstMonth);
  return amounts.map((a, i) => ({ month: addMonths(start, i), amount: a }));
}

function scheduleError(): BusinessRuleError {
  return new BusinessRuleError('The loan must be repaid in 1 to 120 monthly installments.', { code: 'HR_LOAN.BAD_SCHEDULE' });
}

/**
 * Spreads a payment over the open installments, oldest first. Returns how much each one takes.
 * A payment larger than what is still owed is refused.
 */
export function allocatePayment(
  installments: readonly { id: string; amount: bigint; paid: bigint }[],
  payment: bigint,
): { id: string; add: bigint }[] {
  const owed = installments.reduce((sum, i) => sum + (i.amount - i.paid), 0n);
  if (payment > owed) {
    throw new BusinessRuleError('The payment is more than what is left on the loan.', {
      code: 'HR_LOAN.OVERPAYMENT',
      params: { remaining: owed.toString() },
    });
  }
  const out: { id: string; add: bigint }[] = [];
  let left = payment;
  for (const i of installments) {
    if (left === 0n) break;
    const open = i.amount - i.paid;
    if (open <= 0n) continue;
    const add = left < open ? left : open;
    out.push({ id: i.id, add });
    left -= add;
  }
  return out;
}

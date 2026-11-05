import { Money } from '@erp-platform/shared-kernel';
import { BusinessRuleError } from '../errors';
import { entityNotFound } from '../../../../shared/errors/entity-errors';

/** POS checkout rules with no I/O (unit-tested in pos-tenders.spec.ts). */
/** An open session that this user may sell into / close (their own, or any with 'pos.supervise'). */
export function assertSessionUsable(
  session: { status: string; cashierUserId: string } | null,
  id: string,
  actorUserId: string | null,
  canSupervise: boolean,
): void {
  if (!session) throw entityNotFound('POS_SESSION', id);
  if (session.status !== 'open') {
    throw new BusinessRuleError(`POS session "${id}" is "${session.status}" — only an open session can check out a sale.`, {
      code: 'POS_SALE.SESSION_NOT_OPEN',
      params: { id, status: session.status },
    });
  }
  if (!canSupervise && actorUserId !== null && session.cashierUserId !== actorUserId) {
    throw new BusinessRuleError(`POS session "${id}" belongs to another cashier.`, {
      code: 'POS_SALE.NOT_YOUR_SESSION',
      params: { id },
    });
  }
}

/**
 * Tenders against the sale total. Card / wallet / transfer must not exceed
 * the total; cash may (the customer pays 200 for 187.35), and the excess is
 * change handed back — so the recorded cash is only what the sale kept.
 * A fully discounted sale (total 0) takes no tender at all.
 */
export function settleTenders<T extends { paymentMethod: string; amount: Money }>(
  input: readonly T[],
  total: Money,
): { tenders: T[]; change: Money } {
  const currency = total.currency;
  const zero = Money.zero(currency);
  const sum = (list: readonly T[]) => list.reduce((acc, tender) => acc.add(tender.amount), zero);
  if (total.isZero()) return { tenders: [], change: sum(input.filter((t) => t.paymentMethod === 'cash')) };
  if (input.length === 0) {
    throw new BusinessRuleError('A checkout must have at least one tender (payment).', {
      code: 'POS_SALE.AT_LEAST_ONE_TENDER_REQUIRED',
    });
  }
  if (input.some((tender) => !tender.amount.isPositive())) {
    throw new BusinessRuleError('Every payment amount must be positive.', { code: 'POS_SALE.TENDER_NOT_POSITIVE' });
  }
  const tendered = sum(input);
  const nonCash = sum(input.filter((tender) => tender.paymentMethod !== 'cash'));
  if (tendered.lessThan(total) || nonCash.greaterThan(total)) {
    throw new BusinessRuleError(
      `Tendered amount (${tendered.toDecimalString()}) does not cover the sale total (${total.toDecimalString()}).`,
      { code: 'POS_SALE.TENDERED_TOTAL_MISMATCH', params: { tendered: tendered.toDecimalString(), total: total.toDecimalString() } },
    );
  }
  let change = tendered.subtract(total);
  const result: T[] = [];
  // Change comes out of the cash tenders, last one first.
  for (const tender of [...input].reverse()) {
    if (tender.paymentMethod === 'cash' && change.isPositive()) {
      const kept = tender.amount.greaterThan(change) ? tender.amount.subtract(change) : zero;
      change = change.subtract(tender.amount.subtract(kept));
      if (kept.isPositive()) result.unshift({ ...tender, amount: kept });
    } else {
      result.unshift(tender);
    }
  }
  return { tenders: result, change: tendered.subtract(total) };
}

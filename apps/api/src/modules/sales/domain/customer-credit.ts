/**
 * Customer credit limit (migration 0109). Pure rule, no I/O:
 *   exposure = the customer's current balance (posted invoices + opening
 *              − credit notes − posted receipts) + the new document's total
 *   exceeded = a limit is set and exposure > limit
 * The tenant's mode decides what happens: 'off' never checks, 'warn' only
 * reports (never blocks), 'block' rejects unless the user may override.
 * All amounts are minor units of the customer's currency.
 */
export type CreditLimitMode = 'off' | 'warn' | 'block';

export interface CreditCheckInput {
  mode: CreditLimitMode;
  /** null = unlimited. */
  limitMinor: bigint | null;
  balanceMinor: bigint;
  /** The new document's total (0 when only looking). */
  amountMinor: bigint;
  canOverride: boolean;
}

export interface CreditCheckResult {
  exposureMinor: bigint;
  exceeded: boolean;
  /** True only in 'block' mode, when exceeded and the user may not override. */
  blocked: boolean;
}

export function evaluateCreditLimit(input: CreditCheckInput): CreditCheckResult {
  const exposureMinor = input.balanceMinor + input.amountMinor;
  const exceeded = input.mode !== 'off' && input.limitMinor !== null && exposureMinor > input.limitMinor;
  return { exposureMinor, exceeded, blocked: exceeded && input.mode === 'block' && !input.canOverride };
}

export function parseCreditLimitMode(value: string | null | undefined): CreditLimitMode {
  return value === 'warn' || value === 'block' ? value : 'off';
}

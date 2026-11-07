/**
 * Fixed-point helpers for reports: quantities as scaled bigints (QUANTITY_SCALE decimals)
 * and rounded bigint division, so no float ever touches an amount. Shared by the sales and
 * purchase analysis reports.
 */

export const QUANTITY_SCALE = 1_000_000n;
const QUANTITY_DECIMALS = 6;

/** A quantity (number or numeric string from Postgres) as a fixed-point bigint. */
export function toScaledQuantity(quantity: number | string): bigint {
  const text = typeof quantity === 'number' ? quantity.toFixed(QUANTITY_DECIMALS) : quantity.trim();
  const negative = text.startsWith('-');
  const [whole = '0', fraction = ''] = (negative ? text.slice(1) : text).split('.');
  const padded = (fraction + '0'.repeat(QUANTITY_DECIMALS + 1)).slice(0, QUANTITY_DECIMALS + 1);
  let scaled = BigInt(whole || '0') * QUANTITY_SCALE + BigInt(padded.slice(0, QUANTITY_DECIMALS));
  if (Number(padded[QUANTITY_DECIMALS]) >= 5) scaled += 1n;
  return negative ? -scaled : scaled;
}

export function fromScaledQuantity(scaled: bigint): number {
  return Number(scaled) / Number(QUANTITY_SCALE);
}

/** a ÷ b rounded half away from zero (b ≠ 0). */
export function divideRounded(a: bigint, b: bigint): bigint {
  if (b < 0n) return divideRounded(-a, -b);
  const half = b / 2n;
  return a >= 0n ? (a + half) / b : -((-a + half) / b);
}

/**
 * The share of `amountMinor` that belongs to `part` out of `whole`
 * (quantities). Zero when `whole` is zero.
 */
export function proportionalShare(amountMinor: bigint, part: number | string, whole: number | string): bigint {
  const wholeScaled = toScaledQuantity(whole);
  if (wholeScaled === 0n) return 0n;
  return divideRounded(amountMinor * toScaledQuantity(part), wholeScaled);
}

/** part ÷ whole × 100 with two decimals (rounded half away from zero); null when whole is zero. */
export function percentOf(part: bigint, whole: bigint): number | null {
  if (whole === 0n) return null;
  return Number(divideRounded(part * 10_000n, whole)) / 100;
}

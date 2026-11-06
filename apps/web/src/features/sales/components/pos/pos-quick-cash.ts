/** Banknotes the quick-cash buttons round up to (major units, e.g. EGP). */
const NOTES = [50, 100, 200, 500];

/**
 * Quick-cash amounts for a total (minor units, 2 decimals): the exact total,
 * then the next round amount of each note above it — 137.50 → 137.50, 150,
 * 200, 500. Unique and ascending; at most five.
 */
export function quickCashAmounts(totalMinorUnits: bigint): bigint[] {
  if (totalMinorUnits <= 0n) return [];
  const result = new Set<bigint>([totalMinorUnits]);
  for (const note of NOTES) {
    const step = BigInt(note) * 100n;
    const next = ((totalMinorUnits + step - 1n) / step) * step;
    result.add(next === totalMinorUnits ? next + step : next);
  }
  return [...result].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)).slice(0, 5);
}

/** Minor units → the plain decimal text the tender inputs hold ("13750" → "137.50"). */
export function minorToInput(value: bigint): string {
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const whole = abs / 100n;
  const fraction = (abs % 100n).toString().padStart(2, '0');
  return `${negative ? '-' : ''}${whole}.${fraction}`;
}

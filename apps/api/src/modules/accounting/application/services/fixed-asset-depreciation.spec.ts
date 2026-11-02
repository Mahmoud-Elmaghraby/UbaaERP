import { monthlyAmount, openingMonths } from './fixed-assets.service';

type Asset = Parameters<typeof monthlyAmount>[0];

function asset(cost: number, salvage: number, life: number, opening = 0): Asset {
  return {
    cost_amount: String(cost),
    salvage_amount: String(salvage),
    useful_life_months: life,
    opening_accumulated_amount: String(opening),
  } as unknown as Asset;
}

/** Runs the straight-line schedule to the end and returns every month's amount. */
function schedule(a: Asset): bigint[] {
  const amounts: bigint[] = [];
  let accumulated = BigInt(a.opening_accumulated_amount as unknown as string);
  let done = openingMonths(a);
  for (;;) {
    const amount = monthlyAmount(a, accumulated, done);
    if (amount <= 0n) break;
    amounts.push(amount);
    accumulated += amount;
    done += 1;
  }
  return amounts;
}

describe('fixed asset straight-line depreciation', () => {
  it('spreads cost minus salvage over the life, the last month taking the rounding rest', () => {
    const amounts = schedule(asset(100_000, 1_000, 36));
    expect(amounts).toHaveLength(36);
    expect(amounts[0]).toBe(2750n);
    expect(amounts.reduce((s, a) => s + a, 0n)).toBe(99_000n);
  });

  it('continues an asset brought in with opening accumulated depreciation', () => {
    const a = asset(120_000, 0, 60, 24_000); // 12 of 60 months already done
    expect(openingMonths(a)).toBe(12);
    const amounts = schedule(a);
    expect(amounts).toHaveLength(48);
    expect(amounts.reduce((s, x) => s + x, 0n)).toBe(96_000n);
  });

  it('never depreciates below salvage', () => {
    expect(monthlyAmount(asset(10_000, 2_000, 12), 8_000n, 5)).toBe(0n);
  });
});

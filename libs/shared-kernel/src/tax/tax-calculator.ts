/**
 * Egyptian invoice tax engine — the ONE place line taxes are computed, used
 * by the API (what gets posted and sent to the ETA) and by the web (live
 * totals while typing), so the two can never disagree.
 *
 * Kinds (ETA tax types in brackets):
 *  - table        جدول (T2 %): on the net amount; it is part of the VAT base.
 *  - vat          قيمة مضافة (T1): on net + table tax.
 *  - withholding  خصم من المنبع (T4): on the net amount, SUBTRACTED from the
 *                 line total — the buyer keeps it and pays it to the tax
 *                 authority on the seller's behalf.
 *
 * All arithmetic is integer (minor units × thousandths of a percent), each
 * tax rounded half away from zero per line, the way the ETA validates
 * invoices. A rate is a percentage with up to 3 decimals ("14", "0.5").
 *
 * pricesIncludeTax (retail/POS): the given amount is the shelf price
 * INCLUDING table tax and VAT (never withholding); the net is backed out
 * and any rounding remainder stays in the net, so total === given amount.
 */

export type TaxKind = 'vat' | 'table' | 'withholding';

export const TAX_KINDS: readonly TaxKind[] = ['vat', 'table', 'withholding'];

export interface TaxRateInput {
  taxRuleId: string;
  name: string;
  kind: TaxKind;
  /** Percentage, e.g. "14" or 14 or "0.5". */
  rate: string | number;
  etaType?: string | null;
  etaSubtype?: string | null;
}

export interface LineTax {
  taxRuleId: string;
  name: string;
  kind: TaxKind;
  /** Normalized percentage string, e.g. "14.000". */
  rate: string;
  etaType: string | null;
  etaSubtype: string | null;
  /** Minor units the rate was applied to. */
  base: bigint;
  /** Minor units; always positive (withholding is subtracted by the caller's total). */
  amount: bigint;
}

export interface TaxBreakdown {
  net: bigint;
  table: bigint;
  vat: bigint;
  withholding: bigint;
  /** net + table + vat − withholding: what the buyer owes on this line / document. */
  total: bigint;
}

export interface LineTaxResult extends TaxBreakdown {
  taxes: LineTax[];
}

const SCALE = 100_000n; // 100% expressed in thousandths of a percent

/** "14" | 14 | "14.5" → thousandths of a percent (14000, 14500). */
export function rateToMilli(rate: string | number): bigint {
  const text = typeof rate === 'number' ? rate.toString() : rate.trim();
  const match = /^(\d+)(?:\.(\d{1,3})\d*)?$/.exec(text);
  if (!match) throw new Error(`Invalid tax rate "${text}".`);
  const whole = BigInt(match[1]!);
  const fraction = BigInt((match[2] ?? '').padEnd(3, '0'));
  const milli = whole * 1000n + fraction;
  if (milli > SCALE) throw new Error(`Tax rate "${text}" is above 100%.`);
  return milli;
}

export function formatRate(milli: bigint): string {
  return `${milli / 1000n}.${String(milli % 1000n).padStart(3, '0')}`;
}

/** round(a / b) half away from zero, integers only. */
function divRound(a: bigint, b: bigint): bigint {
  const negative = a < 0n !== b < 0n;
  const absA = a < 0n ? -a : a;
  const absB = b < 0n ? -b : b;
  const quotient = (absA * 2n + absB) / (absB * 2n);
  return negative ? -quotient : quotient;
}

/** amount × rate%, rounded per line. */
export function percentOf(amountMinor: bigint, rate: string | number): bigint {
  return divRound(amountMinor * rateToMilli(rate), SCALE);
}

function forward(net: bigint, rates: readonly TaxRateInput[]): LineTaxResult {
  const taxes: LineTax[] = [];
  const add = (input: TaxRateInput, base: bigint) => {
    const milli = rateToMilli(input.rate);
    const amount = divRound(base * milli, SCALE);
    taxes.push({
      taxRuleId: input.taxRuleId,
      name: input.name,
      kind: input.kind,
      rate: formatRate(milli),
      etaType: input.etaType ?? null,
      etaSubtype: input.etaSubtype ?? null,
      base,
      amount,
    });
    return amount;
  };
  let table = 0n;
  for (const rate of rates) if (rate.kind === 'table') table += add(rate, net);
  let vat = 0n;
  for (const rate of rates) if (rate.kind === 'vat') vat += add(rate, net + table);
  let withholding = 0n;
  for (const rate of rates) if (rate.kind === 'withholding') withholding += add(rate, net);
  return { net, table, vat, withholding, total: net + table + vat - withholding, taxes };
}

/**
 * Taxes of one line. `amountMinor` is the line amount after discounts —
 * net, or gross of table tax + VAT when `pricesIncludeTax`.
 */
export function computeLineTaxes(
  amountMinor: bigint,
  rates: readonly TaxRateInput[],
  options: { pricesIncludeTax?: boolean } = {},
): LineTaxResult {
  if (!options.pricesIncludeTax) return forward(amountMinor, rates);

  // gross = net × (1 + t) × (1 + v)  →  net = gross / ((1 + t)(1 + v))
  const t = rates.filter((r) => r.kind === 'table').reduce((sum, r) => sum + rateToMilli(r.rate), 0n);
  const v = rates.filter((r) => r.kind === 'vat').reduce((sum, r) => sum + rateToMilli(r.rate), 0n);
  let net = divRound(amountMinor * SCALE * SCALE, (SCALE + t) * (SCALE + v));
  let result = forward(net, rates);
  // Per-tax rounding can leave the gross a minor unit or two off — absorb it in the net.
  for (let i = 0; i < 3; i++) {
    const grossNow = result.net + result.table + result.vat;
    if (grossNow === amountMinor) break;
    net += amountMinor - grossNow;
    result = forward(net, rates);
  }
  const grossNow = result.net + result.table + result.vat;
  if (grossNow !== amountMinor) {
    result = { ...result, net: result.net + (amountMinor - grossNow) };
    result.total = result.net + result.table + result.vat - result.withholding;
  }
  return result;
}

/** Document totals: the sum of its lines' breakdowns. */
export function sumTaxBreakdowns(lines: readonly TaxBreakdown[]): TaxBreakdown {
  return lines.reduce<TaxBreakdown>(
    (sum, line) => ({
      net: sum.net + line.net,
      table: sum.table + line.table,
      vat: sum.vat + line.vat,
      withholding: sum.withholding + line.withholding,
      total: sum.total + line.total,
    }),
    { net: 0n, table: 0n, vat: 0n, withholding: 0n, total: 0n },
  );
}

/** Breakdown of a line from its stored taxes snapshot (net + taxes → totals). */
export function breakdownFromTaxes(net: bigint, taxes: readonly { kind: TaxKind; amount: bigint }[]): TaxBreakdown {
  let table = 0n;
  let vat = 0n;
  let withholding = 0n;
  for (const tax of taxes) {
    if (tax.kind === 'table') table += tax.amount;
    else if (tax.kind === 'vat') vat += tax.amount;
    else withholding += tax.amount;
  }
  return { net, table, vat, withholding, total: net + table + vat - withholding };
}

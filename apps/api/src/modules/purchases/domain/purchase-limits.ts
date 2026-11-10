/**
 * Purchases limits from the settings hub (phase 3), with no I/O — unit-tested in
 * purchase-limits.spec.ts. PurchaseLimitsService loads the settings and prices and calls these.
 */
export interface PurchasePricedLine {
  lineId: string;
  productVariantId: string;
  /** Line amount before taxes, minor units. */
  netMinor: bigint;
  currency: string;
  /** Quantity in base units. */
  baseQuantity: number;
}

export interface PriceIncrease {
  lineId: string;
  productVariantId: string;
  /** Per base unit, minor units. */
  unitMinor: bigint;
  lastMinor: bigint;
  currency: string;
  /** Rounded to 2 decimals. */
  increasePercent: number;
  lastDocument: string;
}

/**
 * Lines priced above the last purchase price by more than `tolerancePercent`. A variant never
 * bought in this currency has nothing to compare with and passes.
 */
export function findPriceIncreases(
  lines: readonly PurchasePricedLine[],
  lastPrices: ReadonlyMap<string, readonly { unitMinor: bigint; currency: string; documentNumber: string }[]>,
  tolerancePercent: number,
): PriceIncrease[] {
  const out: PriceIncrease[] = [];
  for (const line of lines) {
    if (line.baseQuantity <= 0) continue;
    const last = lastPrices.get(line.productVariantId)?.find((p) => p.currency === line.currency);
    if (!last || last.unitMinor <= 0n) continue;
    const unit = BigInt(Math.round(Number(line.netMinor) / line.baseQuantity));
    const increase = ((Number(unit) - Number(last.unitMinor)) / Number(last.unitMinor)) * 100;
    if (increase > tolerancePercent + 0.005) {
      out.push({
        lineId: line.lineId,
        productVariantId: line.productVariantId,
        unitMinor: unit,
        lastMinor: last.unitMinor,
        currency: line.currency,
        increasePercent: Math.round(increase * 100) / 100,
        lastDocument: last.documentNumber,
      });
    }
  }
  return out;
}

/** Ordered quantity × (1 + tolerance) — what receipts and invoices may reach on one order line. */
export function withTolerance(orderedBase: number, tolerancePercent: number): number {
  return Math.round(orderedBase * (1 + Math.max(0, tolerancePercent) / 100) * 10_000) / 10_000;
}

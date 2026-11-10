/**
 * Sales limits from the settings hub (phase 2), with no I/O — unit-tested in sales-limits.spec.ts.
 * The service (SalesLimitsService) loads the settings and price floors and calls these.
 */
export type RuleMode = 'allow' | 'warn' | 'block';

export interface PricedLine {
  lineId: string;
  productVariantId: string;
  /** What the customer really pays for the line, after line and document discounts (minor units). */
  netMinor: bigint;
  currency: string;
  /** Quantity in base units (line quantity × unit factor). */
  baseQuantity: number;
}

export interface PriceFloorInfo {
  productName: string;
  costMinor: bigint | null;
  costCurrency: string | null;
  minMinor: bigint | null;
  minCurrency: string | null;
}

export type PriceViolationKind = 'below_cost' | 'below_min';

export interface PriceViolation {
  lineId: string;
  productVariantId: string;
  productName: string;
  kind: PriceViolationKind;
  /** Per base unit, minor units. */
  unitNetMinor: bigint;
  floorMinor: bigint;
  currency: string;
}

/**
 * Lines whose price per base unit is below cost / the product's minimum price. A floor in another
 * currency than the line can't be compared without a rate and is skipped; a free line (net 0) is
 * still a sale below cost.
 */
export function findPriceViolations(
  lines: readonly PricedLine[],
  floors: ReadonlyMap<string, PriceFloorInfo>,
  check: { cost: boolean; min: boolean },
): PriceViolation[] {
  const out: PriceViolation[] = [];
  for (const line of lines) {
    const floor = floors.get(line.productVariantId);
    if (!floor || line.baseQuantity <= 0) continue;
    const unitNet = BigInt(Math.floor(Number(line.netMinor) / line.baseQuantity));
    const push = (kind: PriceViolationKind, floorMinor: bigint) =>
      out.push({
        lineId: line.lineId,
        productVariantId: line.productVariantId,
        productName: floor.productName,
        kind,
        unitNetMinor: unitNet,
        floorMinor,
        currency: line.currency,
      });
    if (check.min && floor.minMinor !== null && floor.minCurrency === line.currency && unitNet < floor.minMinor) {
      push('below_min', floor.minMinor);
    }
    if (check.cost && floor.costMinor !== null && floor.costCurrency === line.currency && unitNet < floor.costMinor) {
      push('below_cost', floor.costMinor);
    }
  }
  return out;
}

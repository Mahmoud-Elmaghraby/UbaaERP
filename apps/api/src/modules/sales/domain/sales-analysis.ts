/**
 * Sales analysis (by rep / item / customer / month) — the pure part: turning
 * per-line facts into grouped rows, and the quantity-proportional cost split
 * used to attribute stock-movement cost to document lines. All money is
 * bigint minor units; quantities are compared as fixed-point bigints
 * (QUANTITY_SCALE decimals) so no float ever touches an amount.
 */

export type SalesAnalysisGroupBy = 'rep' | 'item' | 'customer' | 'month';

/** One invoice line (positive) or credit-note line (negative quantity, net and cost). */
export interface SalesFact {
  kind: 'invoice' | 'credit_note';
  documentId: string;
  /** YYYY-MM-DD */
  date: string;
  customerId: string;
  customerName: string;
  salesRepId: string | null;
  salesRepName: string | null;
  productVariantId: string;
  productName: string;
  sku: string | null;
  /** Base units, signed. */
  quantity: number;
  netMinor: bigint;
  costMinor: bigint;
}

export interface SalesAnalysisRow {
  key: string | null;
  label: string;
  secondaryLabel: string | null;
  quantity: number | null;
  netSalesMinor: bigint;
  costMinor: bigint;
  grossProfitMinor: bigint;
  marginPercent: number | null;
  invoiceCount: number;
}

export interface SalesAnalysisTotals {
  netSalesMinor: bigint;
  costMinor: bigint;
  grossProfitMinor: bigint;
  marginPercent: number | null;
  invoiceCount: number;
}

export function aggregateSalesAnalysis(
  facts: readonly SalesFact[],
  groupBy: SalesAnalysisGroupBy,
): { rows: SalesAnalysisRow[]; totals: SalesAnalysisTotals } {
  interface Bucket {
    key: string | null;
    label: string;
    secondaryLabel: string | null;
    quantityScaled: bigint;
    net: bigint;
    cost: bigint;
    invoices: Set<string>;
  }
  const buckets = new Map<string, Bucket>();
  const allInvoices = new Set<string>();
  let totalNet = 0n;
  let totalCost = 0n;

  for (const fact of facts) {
    const { key, label, secondaryLabel } = groupKey(fact, groupBy);
    const mapKey = key ?? '\u0000none';
    let bucket = buckets.get(mapKey);
    if (!bucket) {
      bucket = { key, label, secondaryLabel, quantityScaled: 0n, net: 0n, cost: 0n, invoices: new Set() };
      buckets.set(mapKey, bucket);
    }
    bucket.quantityScaled += toScaledQuantity(fact.quantity);
    bucket.net += fact.netMinor;
    bucket.cost += fact.costMinor;
    if (fact.kind === 'invoice') {
      bucket.invoices.add(fact.documentId);
      allInvoices.add(fact.documentId);
    }
    totalNet += fact.netMinor;
    totalCost += fact.costMinor;
  }

  const rows: SalesAnalysisRow[] = [...buckets.values()].map((b) => ({
    key: b.key,
    label: b.label,
    secondaryLabel: b.secondaryLabel,
    quantity: groupBy === 'item' ? fromScaledQuantity(b.quantityScaled) : null,
    netSalesMinor: b.net,
    costMinor: b.cost,
    grossProfitMinor: b.net - b.cost,
    marginPercent: marginPercent(b.net, b.net - b.cost),
    invoiceCount: b.invoices.size,
  }));
  rows.sort((a, b) => {
    if (groupBy === 'month') return (a.key ?? '').localeCompare(b.key ?? '');
    if (a.netSalesMinor !== b.netSalesMinor) return a.netSalesMinor > b.netSalesMinor ? -1 : 1;
    return a.label.localeCompare(b.label);
  });

  return {
    rows,
    totals: {
      netSalesMinor: totalNet,
      costMinor: totalCost,
      grossProfitMinor: totalNet - totalCost,
      marginPercent: marginPercent(totalNet, totalNet - totalCost),
      invoiceCount: allInvoices.size,
    },
  };
}

function groupKey(fact: SalesFact, groupBy: SalesAnalysisGroupBy): { key: string | null; label: string; secondaryLabel: string | null } {
  switch (groupBy) {
    case 'rep':
      return { key: fact.salesRepId, label: fact.salesRepName ?? '' /* the UI shows "no rep" for a null key */, secondaryLabel: null };
    case 'customer':
      return { key: fact.customerId, label: fact.customerName, secondaryLabel: null };
    case 'item':
      return { key: fact.productVariantId, label: fact.productName, secondaryLabel: fact.sku };
    case 'month':
      return { key: fact.date.slice(0, 7), label: fact.date.slice(0, 7), secondaryLabel: null };
  }
}

/** Gross profit ÷ net × 100 with two decimals (rounded half away from zero); null when net is zero. */
export function marginPercent(netMinor: bigint, grossProfitMinor: bigint): number | null {
  if (netMinor === 0n) return null;
  const basisPoints = divideRounded(grossProfitMinor * 10_000n, netMinor);
  return Number(basisPoints) / 100;
}

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

/**
 * Cost of goods for a quantity of a sales order line, from what its
 * deliveries actually took out of stock.
 *
 * `deliveries` are the line's confirmed delivery lines, each with the total
 * quantity and cost of the stock movements its delivery recorded for that
 * item (a delivery records movements per item, not per line, so a line gets
 * its quantity's share). The line's average delivered unit cost is applied
 * to `quantity`. With nothing delivered (or not yet costed), `fallbackUnitCostMinor`
 * — the item's current average cost — is used instead.
 */
export function costOfQuantity(
  quantity: number | string,
  deliveries: readonly { lineQuantity: number | string; movedQuantity: number | string; movedCostMinor: bigint }[],
  fallbackUnitCostMinor: bigint,
): bigint {
  let cost = 0n;
  let delivered = 0n;
  for (const d of deliveries) {
    cost += proportionalShare(d.movedCostMinor, d.lineQuantity, d.movedQuantity);
    delivered += toScaledQuantity(d.lineQuantity);
  }
  const qty = toScaledQuantity(quantity);
  if (delivered > 0n) return divideRounded(cost * qty, delivered);
  return divideRounded(fallbackUnitCostMinor * qty, QUANTITY_SCALE);
}

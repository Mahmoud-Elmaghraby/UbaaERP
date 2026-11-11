import {
  divideRounded,
  fromScaledQuantity,
  proportionalShare,
  QUANTITY_SCALE,
  toScaledQuantity,
} from '../../../shared/reporting/fixed-point';

/**
 * Sales analysis (by rep / item / customer / month) — the pure part: turning
 * per-line facts into grouped rows, and the quantity-proportional cost split
 * used to attribute stock-movement cost to document lines. All money is
 * bigint minor units; quantities are compared as fixed-point bigints
 * (QUANTITY_SCALE decimals) so no float ever touches an amount.
 */

export type SalesAnalysisGroupBy = 'rep' | 'item' | 'product' | 'category' | 'option' | 'customer' | 'cashier' | 'channel' | 'month';

/** Groupings that sum a quantity (one item, or items of one kind). */
const QUANTITY_GROUPS: ReadonlySet<SalesAnalysisGroupBy> = new Set(['item', 'product', 'category', 'option']);

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
  /** The product (all its sizes / colours), its category and option values (size, colour…). */
  productId?: string;
  productCode?: string;
  categoryId?: string | null;
  categoryName?: string | null;
  attributes?: Record<string, unknown>;
  /** POS cashier of the sale (null = not a till sale) and the sales channel (null = direct). */
  cashierId?: string | null;
  cashierName?: string | null;
  channelId?: string | null;
  channelName?: string | null;
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
  /** groupBy 'option': which option ("المقاس", "اللون"…). */
  optionName?: string,
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
    const { key, label, secondaryLabel } = groupKey(fact, groupBy, optionName);
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
    quantity: QUANTITY_GROUPS.has(groupBy) ? fromScaledQuantity(b.quantityScaled) : null,
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

function groupKey(
  fact: SalesFact,
  groupBy: SalesAnalysisGroupBy,
  optionName?: string,
): { key: string | null; label: string; secondaryLabel: string | null } {
  switch (groupBy) {
    case 'product':
      return { key: fact.productId ?? fact.productVariantId, label: fact.productName, secondaryLabel: fact.productCode ?? null };
    case 'category':
      return { key: fact.categoryId ?? null, label: fact.categoryName ?? '', secondaryLabel: null };
    case 'option': {
      const value = optionName ? fact.attributes?.[optionName] : undefined;
      const text = value === undefined || value === null || value === '' ? null : String(value);
      return { key: text, label: text ?? '', secondaryLabel: null };
    }
    case 'cashier':
      return { key: fact.cashierId ?? null, label: fact.cashierName ?? '', secondaryLabel: null };
    case 'channel':
      return { key: fact.channelId ?? null, label: fact.channelName ?? '', secondaryLabel: null };
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

export { divideRounded, fromScaledQuantity, proportionalShare, QUANTITY_SCALE, toScaledQuantity };

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

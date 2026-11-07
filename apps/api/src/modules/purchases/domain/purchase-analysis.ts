import { divideRounded, fromScaledQuantity, percentOf, toScaledQuantity } from '../../../shared/reporting/fixed-point';

/**
 * Purchase analysis (by supplier / item / category / month) — the pure part: per-line facts
 * into grouped rows. Money is bigint minor units; quantities are fixed-point bigints.
 */

export type PurchaseAnalysisGroupBy = 'supplier' | 'item' | 'category' | 'month';

/** One posted purchase invoice line (kind 'invoice') or debit-note line (kind 'debit_note'). */
export interface PurchaseFact {
  kind: 'invoice' | 'debit_note';
  documentId: string;
  /** YYYY-MM-DD */
  date: string;
  supplierId: string;
  supplierName: string;
  productVariantId: string;
  productName: string;
  sku: string | null;
  categoryId: string | null;
  categoryName: string | null;
  /** Base units, always positive (the kind says which way it counts). */
  quantity: number | string;
  /** Before tax, always positive. */
  netMinor: bigint;
}

export interface PurchaseAnalysisRow {
  key: string | null;
  label: string;
  secondaryLabel: string | null;
  quantity: number | null;
  grossMinor: bigint;
  returnsMinor: bigint;
  netMinor: bigint;
  averageUnitCostMinor: bigint | null;
  sharePercent: number | null;
  invoiceCount: number;
}

export interface PurchaseAnalysisTotals {
  grossMinor: bigint;
  returnsMinor: bigint;
  netMinor: bigint;
  invoiceCount: number;
}

export function aggregatePurchaseAnalysis(
  facts: readonly PurchaseFact[],
  groupBy: PurchaseAnalysisGroupBy,
): { rows: PurchaseAnalysisRow[]; totals: PurchaseAnalysisTotals } {
  interface Bucket {
    key: string | null;
    label: string;
    secondaryLabel: string | null;
    quantityScaled: bigint;
    gross: bigint;
    returns: bigint;
    invoices: Set<string>;
  }
  const buckets = new Map<string, Bucket>();
  const allInvoices = new Set<string>();
  let gross = 0n;
  let returns = 0n;

  for (const fact of facts) {
    const { key, label, secondaryLabel } = groupKey(fact, groupBy);
    const mapKey = key ?? '\u0000none';
    let bucket = buckets.get(mapKey);
    if (!bucket) {
      bucket = { key, label, secondaryLabel, quantityScaled: 0n, gross: 0n, returns: 0n, invoices: new Set() };
      buckets.set(mapKey, bucket);
    }
    const qty = toScaledQuantity(fact.quantity);
    if (fact.kind === 'invoice') {
      bucket.quantityScaled += qty;
      bucket.gross += fact.netMinor;
      bucket.invoices.add(fact.documentId);
      allInvoices.add(fact.documentId);
      gross += fact.netMinor;
    } else {
      bucket.quantityScaled -= qty;
      bucket.returns += fact.netMinor;
      returns += fact.netMinor;
    }
  }

  const totalNet = gross - returns;
  const withQuantity = groupBy === 'item' || groupBy === 'category';
  const rows: PurchaseAnalysisRow[] = [...buckets.values()].map((b) => {
    const net = b.gross - b.returns;
    return {
      key: b.key,
      label: b.label,
      secondaryLabel: b.secondaryLabel,
      quantity: withQuantity ? fromScaledQuantity(b.quantityScaled) : null,
      grossMinor: b.gross,
      returnsMinor: b.returns,
      netMinor: net,
      averageUnitCostMinor:
        groupBy === 'item' && b.quantityScaled > 0n ? divideRounded(net * 1_000_000n, b.quantityScaled) : null,
      sharePercent: percentOf(net, totalNet),
      invoiceCount: b.invoices.size,
    };
  });
  rows.sort((a, b) => {
    if (groupBy === 'month') return (a.key ?? '').localeCompare(b.key ?? '');
    if (a.netMinor !== b.netMinor) return a.netMinor > b.netMinor ? -1 : 1;
    return a.label.localeCompare(b.label);
  });

  return { rows, totals: { grossMinor: gross, returnsMinor: returns, netMinor: totalNet, invoiceCount: allInvoices.size } };
}

function groupKey(
  fact: PurchaseFact,
  groupBy: PurchaseAnalysisGroupBy,
): { key: string | null; label: string; secondaryLabel: string | null } {
  switch (groupBy) {
    case 'supplier':
      return { key: fact.supplierId, label: fact.supplierName, secondaryLabel: null };
    case 'item':
      return { key: fact.productVariantId, label: fact.productName, secondaryLabel: fact.sku };
    case 'category':
      return { key: fact.categoryId, label: fact.categoryName ?? '' /* the UI shows "no category" */, secondaryLabel: null };
    case 'month':
      return { key: fact.date.slice(0, 7), label: fact.date.slice(0, 7), secondaryLabel: null };
  }
}

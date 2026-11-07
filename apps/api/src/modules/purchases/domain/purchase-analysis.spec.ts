import { aggregatePurchaseAnalysis, type PurchaseFact } from './purchase-analysis';

function fact(patch: Partial<PurchaseFact>): PurchaseFact {
  return {
    kind: 'invoice',
    documentId: 'i1',
    date: '2026-10-05',
    supplierId: 's1',
    supplierName: 'Supplier A',
    productVariantId: 'v1',
    productName: 'Shirt',
    sku: 'SH-1',
    categoryId: 'c1',
    categoryName: 'Shirts',
    quantity: 10,
    netMinor: 10_000n,
    ...patch,
  };
}

describe('aggregatePurchaseAnalysis', () => {
  const facts: PurchaseFact[] = [
    fact({}),
    fact({ documentId: 'i2', supplierId: 's2', supplierName: 'Supplier B', quantity: 5, netMinor: 6_000n, date: '2026-11-01' }),
    fact({ kind: 'debit_note', documentId: 'd1', quantity: 2, netMinor: 2_000n }),
  ];

  it('nets debit notes against invoices per supplier and orders by net', () => {
    const { rows, totals } = aggregatePurchaseAnalysis(facts, 'supplier');
    expect(rows.map((r) => [r.key, r.netMinor, r.invoiceCount])).toEqual([
      ['s1', 8_000n, 1],
      ['s2', 6_000n, 1],
    ]);
    expect(totals).toEqual({ grossMinor: 16_000n, returnsMinor: 2_000n, netMinor: 14_000n, invoiceCount: 2 });
    expect(rows[0]!.sharePercent).toBe(57.14);
  });

  it('gives quantity and average unit cost per item, net of returns', () => {
    const { rows } = aggregatePurchaseAnalysis(facts, 'item');
    expect(rows).toHaveLength(1);
    expect(rows[0]!.quantity).toBe(13);
    // 14 000 ÷ 13 = 1 076.92… → 1 077
    expect(rows[0]!.averageUnitCostMinor).toBe(1_077n);
  });

  it('groups by month in date order and keeps items without a category together', () => {
    expect(aggregatePurchaseAnalysis(facts, 'month').rows.map((r) => r.key)).toEqual(['2026-10', '2026-11']);
    const byCategory = aggregatePurchaseAnalysis([fact({ categoryId: null, categoryName: null })], 'category');
    expect(byCategory.rows[0]!.key).toBeNull();
  });
});

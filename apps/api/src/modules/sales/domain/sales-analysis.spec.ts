import {
  aggregateSalesAnalysis,
  costOfQuantity,
  divideRounded,
  marginPercent,
  proportionalShare,
  toScaledQuantity,
  type SalesFact,
} from './sales-analysis';

function fact(overrides: Partial<SalesFact>): SalesFact {
  return {
    kind: 'invoice',
    documentId: 'inv-1',
    date: '2026-10-05',
    customerId: 'cust-1',
    customerName: 'Customer 1',
    salesRepId: 'rep-1',
    salesRepName: 'Rep 1',
    productVariantId: 'var-1',
    productName: 'Item 1',
    sku: 'SKU-1',
    quantity: 1,
    netMinor: 0n,
    costMinor: 0n,
    ...overrides,
  };
}

describe('sales analysis aggregation', () => {
  const facts: SalesFact[] = [
    fact({ documentId: 'inv-1', quantity: 2, netMinor: 10_000n, costMinor: 6_000n }),
    fact({ documentId: 'inv-1', productVariantId: 'var-2', productName: 'Item 2', sku: 'SKU-2', quantity: 1, netMinor: 5_000n, costMinor: 1_000n }),
    fact({ documentId: 'inv-2', date: '2026-11-01', salesRepId: null, salesRepName: null, customerId: 'cust-2', customerName: 'Customer 2', quantity: 3, netMinor: 15_000n, costMinor: 9_000n }),
    // Return of one unit of var-1 from inv-1.
    fact({ kind: 'credit_note', documentId: 'cn-1', date: '2026-11-02', quantity: -1, netMinor: -5_000n, costMinor: -3_000n }),
  ];

  it('groups by rep with net of credit notes, COGS, profit, margin and invoice count', () => {
    const { rows, totals } = aggregateSalesAnalysis(facts, 'rep');
    expect(rows).toHaveLength(2);
    const rep1 = rows.find((r) => r.key === 'rep-1')!;
    expect(rep1.netSalesMinor).toBe(10_000n);
    expect(rep1.costMinor).toBe(4_000n);
    expect(rep1.grossProfitMinor).toBe(6_000n);
    expect(rep1.marginPercent).toBe(60);
    expect(rep1.invoiceCount).toBe(1);
    expect(rep1.quantity).toBeNull();
    const none = rows.find((r) => r.key === null)!;
    expect(none.netSalesMinor).toBe(15_000n);
    expect(totals.netSalesMinor).toBe(25_000n);
    expect(totals.costMinor).toBe(13_000n);
    expect(totals.grossProfitMinor).toBe(12_000n);
    expect(totals.marginPercent).toBe(48);
    expect(totals.invoiceCount).toBe(2);
    // Sorted by net sales, highest first.
    expect(rows[0]!.key).toBeNull();
  });

  it('groups by item with net quantities', () => {
    const { rows } = aggregateSalesAnalysis(facts, 'item');
    const item1 = rows.find((r) => r.key === 'var-1')!;
    expect(item1.quantity).toBe(4);
    expect(item1.secondaryLabel).toBe('SKU-1');
    expect(item1.netSalesMinor).toBe(20_000n);
    expect(item1.invoiceCount).toBe(2);
  });

  it('groups by month in calendar order', () => {
    const { rows } = aggregateSalesAnalysis(facts, 'month');
    expect(rows.map((r) => r.key)).toEqual(['2026-10', '2026-11']);
    expect(rows[1]!.netSalesMinor).toBe(10_000n);
    expect(rows[1]!.invoiceCount).toBe(1);
  });

  it('groups by customer', () => {
    const { rows } = aggregateSalesAnalysis(facts, 'customer');
    expect(rows.map((r) => [r.key, r.netSalesMinor])).toEqual([
      ['cust-2', 15_000n],
      ['cust-1', 10_000n],
    ]);
  });

  it('returns a null margin when net sales is zero', () => {
    expect(marginPercent(0n, -100n)).toBeNull();
    expect(marginPercent(30_000n, 10_000n)).toBe(33.33);
    expect(marginPercent(30_000n, -20_000n)).toBe(-66.67);
  });
});

describe('cost attribution helpers', () => {
  it('scales decimal quantities exactly', () => {
    expect(toScaledQuantity('2.5000')).toBe(2_500_000n);
    expect(toScaledQuantity(0.1 + 0.2)).toBe(300_000n);
    expect(toScaledQuantity('-1.25')).toBe(-1_250_000n);
  });

  it('rounds half away from zero', () => {
    expect(divideRounded(5n, 2n)).toBe(3n);
    expect(divideRounded(-5n, 2n)).toBe(-3n);
    expect(divideRounded(4n, 3n)).toBe(1n);
  });

  it('splits a delivery cost by line quantity', () => {
    expect(proportionalShare(1_000n, 1, 3)).toBe(333n);
    expect(proportionalShare(1_000n, '2', '3')).toBe(667n);
    expect(proportionalShare(1_000n, 1, 0)).toBe(0n);
  });

  it('applies the average delivered unit cost to the invoiced quantity', () => {
    // Two deliveries of the same order line: 2 units at 10.00 and 2 units at 12.00 (each delivery
    // also moved 2 units of another line of the same item, so the line takes half).
    const deliveries = [
      { lineQuantity: '2', movedQuantity: '4', movedCostMinor: 4_000n },
      { lineQuantity: '2', movedQuantity: '4', movedCostMinor: 4_800n },
    ];
    expect(costOfQuantity(4, deliveries, 0n)).toBe(4_400n);
    expect(costOfQuantity(1, deliveries, 0n)).toBe(1_100n);
  });

  it('falls back to the current average cost when nothing was delivered', () => {
    expect(costOfQuantity('1.5', [], 1_000n)).toBe(1_500n);
    expect(costOfQuantity(3, [], 0n)).toBe(0n);
  });
});

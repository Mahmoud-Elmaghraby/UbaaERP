import { Money } from '@erp-platform/shared-kernel';
import { computePurchasePriceDifferences } from './purchase-price-differences';
import type { ReceivedOrderLineValue } from './goods-receipts.service';

const egp = (minor: number) => Money.fromMinorUnits(BigInt(minor), 'EGP');
const received = (baseQuantity: number, valueMinor: number): ReceivedOrderLineValue => ({
  baseQuantity,
  value: egp(valueMinor),
  goodsReceiptIds: ['gr1'],
  complete: true,
});

describe('computePurchasePriceDifferences', () => {
  it('received at 100, invoiced at 110 → +10 per unit on the matched quantity', () => {
    const [diff] = computePurchasePriceDifferences({
      lines: [{ purchaseOrderLineId: 'pol1', productVariantId: 'v1', baseQuantity: 10, netAmount: egp(110_000) }],
      received: new Map([['pol1', received(10, 100_000)]]),
      previouslyInvoiced: new Map(),
      tenantCurrency: 'EGP',
      rate: null,
    });
    expect(diff).toMatchObject({ matchedBaseQuantity: 10, amount: { amountMinorUnits: '10000', currency: 'EGP' } });
  });

  it('a cheaper invoice gives a negative difference', () => {
    const [diff] = computePurchasePriceDifferences({
      lines: [{ purchaseOrderLineId: 'pol1', productVariantId: 'v1', baseQuantity: 5, netAmount: egp(45_000) }],
      received: new Map([['pol1', received(5, 50_000)]]),
      previouslyInvoiced: new Map(),
      tenantCurrency: 'EGP',
      rate: null,
    });
    expect(diff.amount.amountMinorUnits).toBe('-5000');
  });

  it('only matches what was received and not invoiced before', () => {
    // 10 received at 100, 6 already invoiced; this invoice bills 8 at 120 → 4 match.
    const [diff] = computePurchasePriceDifferences({
      lines: [{ purchaseOrderLineId: 'pol1', productVariantId: 'v1', baseQuantity: 8, netAmount: egp(96_000) }],
      received: new Map([['pol1', received(10, 100_000)]]),
      previouslyInvoiced: new Map([['pol1', 6]]),
      tenantCurrency: 'EGP',
      rate: null,
    });
    expect(diff).toMatchObject({
      matchedBaseQuantity: 4,
      receivedValue: { amountMinorUnits: '40000' },
      invoicedValue: { amountMinorUnits: '48000' },
      amount: { amountMinorUnits: '8000' },
    });
  });

  it('converts a foreign invoice at the given rate', () => {
    // Received worth 4,800 EGP; invoiced 100 USD at 50 → 5,000 EGP.
    const [diff] = computePurchasePriceDifferences({
      lines: [
        {
          purchaseOrderLineId: 'pol1',
          productVariantId: 'v1',
          baseQuantity: 1,
          netAmount: Money.fromMinorUnits(10_000n, 'USD'),
        },
      ],
      received: new Map([['pol1', received(1, 480_000)]]),
      previouslyInvoiced: new Map(),
      tenantCurrency: 'EGP',
      rate: '50',
    });
    expect(diff.amount).toEqual({ amountMinorUnits: '20000', currency: 'EGP' });
  });

  it('skips equal prices, unreceived lines and incomplete receipts', () => {
    const result = computePurchasePriceDifferences({
      lines: [
        { purchaseOrderLineId: 'same', productVariantId: 'v1', baseQuantity: 2, netAmount: egp(2_000) },
        { purchaseOrderLineId: 'none', productVariantId: 'v2', baseQuantity: 2, netAmount: egp(2_000) },
        { purchaseOrderLineId: 'old', productVariantId: 'v3', baseQuantity: 2, netAmount: egp(9_000) },
      ],
      received: new Map([
        ['same', received(2, 2_000)],
        ['old', { ...received(2, 2_000), complete: false }],
      ]),
      previouslyInvoiced: new Map(),
      tenantCurrency: 'EGP',
      rate: null,
    });
    expect(result).toEqual([]);
  });
});

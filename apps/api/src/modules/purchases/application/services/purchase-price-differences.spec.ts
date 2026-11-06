import { Money } from '@erp-platform/shared-kernel';
import { computePurchasePriceDifferences, computeReceiptInvoiceDifferences } from './purchase-price-differences';
import { applyRate } from '../../../../shared/catalog/currency-rate-reader';
import type { ReceivedOrderLineValue } from './goods-receipts.service';

const egp = (minor: number) => Money.fromMinorUnits(BigInt(minor), 'EGP');
const usd = (minor: number) => Money.fromMinorUnits(BigInt(minor), 'USD');
const received = (baseQuantity: number, valueMinor: number, documentValue?: Money): ReceivedOrderLineValue => ({
  baseQuantity,
  value: egp(valueMinor),
  documentValue: documentValue ?? egp(valueMinor),
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

  it('a foreign invoice at the receipt price: the whole rate movement is an exchange difference, not cost', () => {
    // Received 100 USD at 48 = 4,800 EGP; invoiced 100 USD at 50 = 5,000 EGP.
    // Before the IAS 21 split this was a +200 EGP cost correction; now it is price 0 / FX +200.
    const [diff] = computePurchasePriceDifferences({
      lines: [{ purchaseOrderLineId: 'pol1', productVariantId: 'v1', baseQuantity: 1, netAmount: usd(10_000) }],
      received: new Map([['pol1', received(1, 480_000, usd(10_000))]]),
      previouslyInvoiced: new Map(),
      tenantCurrency: 'EGP',
      rate: '50',
    });
    expect(diff.amount).toEqual({ amountMinorUnits: '0', currency: 'EGP' });
    expect(diff.exchangeDifference).toEqual({ amountMinorUnits: '20000', currency: 'EGP' });
  });

  it('splits a foreign invoice with both a price difference and a rate movement', () => {
    // 10 units ordered/received at 10 USD (100 USD) at 48 = 4,800 EGP; invoiced at 11 USD (110 USD) at 50 = 5,500 EGP.
    // price = (110 − 100) USD × 50 = 500 EGP; FX = 100 USD × (50 − 48) = 200 EGP.
    const [diff] = computePurchasePriceDifferences({
      lines: [{ purchaseOrderLineId: 'pol1', productVariantId: 'v1', baseQuantity: 10, netAmount: usd(11_000) }],
      received: new Map([['pol1', received(10, 480_000, usd(10_000))]]),
      previouslyInvoiced: new Map(),
      tenantCurrency: 'EGP',
      rate: '50',
    });
    expect(diff).toMatchObject({
      receivedValue: { amountMinorUnits: '480000' },
      invoicedValue: { amountMinorUnits: '550000' },
      amount: { amountMinorUnits: '50000' },
      exchangeDifference: { amountMinorUnits: '20000' },
    });
  });

  it('throws for a foreign invoice without a rate (the caller must refuse to post)', () => {
    expect(() =>
      computePurchasePriceDifferences({
        lines: [{ purchaseOrderLineId: 'pol1', productVariantId: 'v1', baseQuantity: 1, netAmount: usd(10_000) }],
        received: new Map([['pol1', received(1, 480_000, usd(10_000))]]),
        previouslyInvoiced: new Map(),
        tenantCurrency: 'EGP',
        rate: null,
      }),
    ).toThrow();
  });

  it('awkward rates: partial matches add up exactly to what the receipt credited GRNI with', () => {
    // 3 units received for 100.01 USD at 47.3359 → 4,734.06 EGP (rounded once, as the receipt did).
    const receipt = received(3, 473_406, usd(10_001));
    const parts = [1, 1, 1].map((qty, index) =>
      computePurchasePriceDifferences({
        lines: [{ purchaseOrderLineId: 'pol1', productVariantId: 'v1', baseQuantity: qty, netAmount: usd(3_334) }],
        received: new Map([['pol1', receipt]]),
        previouslyInvoiced: new Map([['pol1', index]]),
        tenantCurrency: 'EGP',
        rate: '49.1177',
      })[0],
    );
    const sum = (key: 'receivedValue' | 'amount' | 'exchangeDifference' | 'invoicedValue') =>
      parts.reduce((total, part) => total + BigInt(part[key]!.amountMinorUnits), 0n);
    expect(sum('receivedValue')).toBe(473_406n);
    for (const part of parts) {
      expect(BigInt(part.invoicedValue.amountMinorUnits)).toBe(
        BigInt(part.receivedValue.amountMinorUnits) + BigInt(part.amount.amountMinorUnits) + BigInt(part.exchangeDifference!.amountMinorUnits),
      );
    }
    // The receipt's own USD value at the invoice rate is 100.01 × 49.1177, split exactly.
    expect(sum('receivedValue') + sum('exchangeDifference')).toBe(491_226n);
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

describe('computeReceiptInvoiceDifferences (invoice before receipt)', () => {
  const invoiceLine = (baseQuantity: number, net: Money, rate: string | null, id = 'inv1') => ({
    purchaseOrderLineId: 'pol1',
    purchaseInvoiceId: id,
    invoiceNumber: id.toUpperCase(),
    invoiceDate: '2026-11-01',
    baseQuantity,
    netAmount: net,
    rate,
  });
  const receiptLine = (baseQuantity: number, documentValue: Money, ledgerValue: Money) => ({
    goodsReceiptId: 'gr1',
    purchaseOrderLineId: 'pol1',
    productVariantId: 'v1',
    baseQuantity,
    documentValue,
    ledgerValue,
  });

  it('splits an earlier foreign invoice against a later receipt: price part and FX part', () => {
    // Invoiced 10 at 11 USD (110 USD) at 50 → GRNI Dr 5,500. Received 10 at the PO's 10 USD at 48 → GRNI Cr 4,800.
    const [diff] = computeReceiptInvoiceDifferences({
      receiptLines: [receiptLine(10, usd(10_000), egp(480_000))],
      invoicedLines: [invoiceLine(10, usd(11_000), '50')],
      previouslyReceived: new Map(),
      tenantCurrency: 'EGP',
    });
    expect(diff).toMatchObject({
      purchaseInvoiceId: 'inv1',
      invoiceDate: '2026-11-01',
      matchedBaseQuantity: 10,
      invoiceUnitPrice: { amountMinorUnits: '1100', currency: 'USD' },
      receivedValue: { amountMinorUnits: '480000' },
      invoicedValue: { amountMinorUnits: '550000' },
      amount: { amountMinorUnits: '50000' },
      exchangeDifference: { amountMinorUnits: '20000' },
    });
  });

  it('only covers the invoiced quantity not brought in by earlier receipts', () => {
    // 10 invoiced, 6 already received; this receipt brings 8 → 4 were invoiced before arriving.
    const [diff] = computeReceiptInvoiceDifferences({
      receiptLines: [receiptLine(8, egp(80_000), egp(80_000))],
      invoicedLines: [invoiceLine(10, egp(120_000), null)],
      previouslyReceived: new Map([['pol1', 6]]),
      tenantCurrency: 'EGP',
    });
    expect(diff).toMatchObject({
      matchedBaseQuantity: 4,
      receivedValue: { amountMinorUnits: '40000' },
      invoicedValue: { amountMinorUnits: '48000' },
      amount: { amountMinorUnits: '8000' },
      exchangeDifference: { amountMinorUnits: '0' },
    });
  });

  it('walks several invoices in order and ignores a receipt with nothing invoiced ahead of it', () => {
    const result = computeReceiptInvoiceDifferences({
      receiptLines: [receiptLine(4, egp(40_000), egp(40_000))],
      invoicedLines: [invoiceLine(2, egp(22_000), null, 'inv1'), invoiceLine(1, egp(12_000), null, 'inv2')],
      previouslyReceived: new Map(),
      tenantCurrency: 'EGP',
    });
    expect(result.map((d) => [d.purchaseInvoiceId, d.matchedBaseQuantity, d.amount.amountMinorUnits])).toEqual([
      ['inv1', 2, '2000'],
      ['inv2', 1, '2000'],
    ]);
    expect(
      computeReceiptInvoiceDifferences({
        receiptLines: [receiptLine(4, egp(40_000), egp(40_000))],
        invoicedLines: [invoiceLine(3, egp(33_000), null)],
        previouslyReceived: new Map([['pol1', 3]]),
        tenantCurrency: 'EGP',
      }),
    ).toEqual([]);
  });

  it('awkward rates: the invoice part matched at posting + later receipts add up to the invoice line exactly', () => {
    // Invoice: 3 units, 100.02 USD at 49.1177 (ledger 4,912.76). One unit had arrived when it was posted.
    const invoiceNet = usd(10_002);
    const [atPosting] = computePurchasePriceDifferences({
      lines: [{ purchaseOrderLineId: 'pol1', productVariantId: 'v1', baseQuantity: 3, netAmount: invoiceNet }],
      received: new Map([['pol1', received(1, 157_786, usd(3_334))]]),
      previouslyInvoiced: new Map(),
      tenantCurrency: 'EGP',
      rate: '49.1177',
    });
    // Then two receipts of one unit each at 47.3359.
    const later = [1, 2].flatMap((previous) =>
      computeReceiptInvoiceDifferences({
        receiptLines: [receiptLine(1, usd(3_334), egp(157_818))],
        invoicedLines: [invoiceLine(3, invoiceNet, '49.1177')],
        previouslyReceived: new Map([['pol1', previous]]),
        tenantCurrency: 'EGP',
      }),
    );
    const invoiced = [atPosting, ...later].reduce((sum, d) => sum + BigInt(d.invoicedValue.amountMinorUnits), 0n);
    // The line's ledger value (what the invoice event's ledgerNetAmount carries): 100.02 × 49.1177.
    expect(invoiced).toBe(applyRate(10_002n, '49.1177'));
    expect(invoiced).toBe(491_275n);
  });
});

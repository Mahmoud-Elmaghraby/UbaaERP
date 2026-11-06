import { spreadDebitNoteCredits, type InvoiceForCreditSpread } from './purchase-invoice-balance';

const invoice = (id: string, date: string, total: bigint, paid = 0n, order = 'po-1'): InvoiceForCreditSpread => ({
  id,
  purchaseOrderId: order,
  date,
  createdAt: new Date(`${date}T10:00:00Z`),
  totalMinor: total,
  paidMinor: paid,
});

describe('spreadDebitNoteCredits', () => {
  it('credits the oldest invoice of the order first, then the next', () => {
    const result = spreadDebitNoteCredits(
      [invoice('b', '2026-10-05', 1000n), invoice('a', '2026-10-01', 600n)],
      new Map([['po-1', 900n]]),
    );
    expect(result).toEqual(new Map([['a', 600n], ['b', 300n]]));
  });

  it('never credits more than is still unpaid on an invoice; the rest stays unspread', () => {
    const result = spreadDebitNoteCredits(
      [invoice('a', '2026-10-01', 600n, 500n), invoice('b', '2026-10-02', 200n, 200n)],
      new Map([['po-1', 900n]]),
    );
    expect(result).toEqual(new Map([['a', 100n]]));
  });

  it('keeps credits within their own purchase order', () => {
    const result = spreadDebitNoteCredits(
      [invoice('a', '2026-10-01', 600n, 0n, 'po-1'), invoice('b', '2026-10-01', 600n, 0n, 'po-2')],
      new Map([['po-2', 250n]]),
    );
    expect(result).toEqual(new Map([['b', 250n]]));
  });

  it('breaks same-day ties by creation time', () => {
    const early = { ...invoice('z', '2026-10-01', 500n), createdAt: new Date('2026-10-01T08:00:00Z') };
    const late = { ...invoice('a', '2026-10-01', 500n), createdAt: new Date('2026-10-01T09:00:00Z') };
    expect(spreadDebitNoteCredits([late, early], new Map([['po-1', 300n]]))).toEqual(new Map([['z', 300n]]));
  });

  it('no debit notes → no credits', () => {
    expect(spreadDebitNoteCredits([invoice('a', '2026-10-01', 600n)], new Map()).size).toBe(0);
  });
});

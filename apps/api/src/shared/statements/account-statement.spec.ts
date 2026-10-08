import { addDays, ageBalance, buildAccountStatement, daysBetween, openingBalanceEntry, type PartyLedgerEntry } from './account-statement';

function entry(date: string, amount: number, kind: PartyLedgerEntry['kind'] = 'sales_invoice', dueDate: string | null = null): PartyLedgerEntry {
  return { date, kind, documentId: `${kind}-${date}`, number: `${kind}-${date}`, reference: null, amountMinor: BigInt(amount), dueDate, sequence: date };
}

describe('buildAccountStatement', () => {
  const entries = [
    openingBalanceEntry(500n, '2026-01-01')!,
    entry('2026-02-10', 1000),
    entry('2026-02-15', -700, 'payment_received'),
    entry('2026-03-05', 300),
    entry('2026-03-20', -100, 'sales_credit_note'),
  ];

  it('runs the balance from the opening balance through every document', () => {
    const s = buildAccountStatement(entries);
    expect(s.openingBalanceMinor).toBe(0n);
    expect(s.rows.map((r) => r.balanceMinor)).toEqual([500n, 1500n, 800n, 1100n, 1000n]);
    expect(s.totalIncreaseMinor).toBe(1800n);
    expect(s.totalDecreaseMinor).toBe(800n);
    expect(s.closingBalanceMinor).toBe(1000n);
  });

  it('collapses everything before the period into the opening balance and ignores what is after it', () => {
    const s = buildAccountStatement(entries, { from: '2026-02-12', to: '2026-03-10' });
    expect(s.openingBalanceMinor).toBe(1500n);
    expect(s.rows.map((r) => [r.kind, r.balanceMinor])).toEqual([
      ['payment_received', 800n],
      ['sales_invoice', 1100n],
    ]);
    expect(s.closingBalanceMinor).toBe(1100n);
  });

  it('puts the opening balance first on its own date', () => {
    const s = buildAccountStatement([entry('2026-01-01', 10), openingBalanceEntry(5n, '2026-01-01')!]);
    expect(s.rows[0]!.kind).toBe('opening_balance');
  });
});

describe('ageBalance (balance forward)', () => {
  it('settles the oldest amounts first and ages the rest by due date', () => {
    const entries = [
      openingBalanceEntry(100n, '2025-12-01')!, // 120+ days old → paid off first
      entry('2026-01-20', 400, 'sales_invoice', '2026-02-19'), // due 2026-02-19
      entry('2026-03-01', 300, 'sales_invoice', '2026-03-31'),
      entry('2026-03-15', -250, 'payment_received'),
    ];
    const aging = ageBalance(entries, '2026-04-10');
    // 250 settles 100 (opening) + 150 of the January invoice → 250 left, 50 days overdue.
    expect(aging.days31To60Minor).toBe(250n);
    // March invoice due 2026-03-31 → 10 days overdue.
    expect(aging.days1To30Minor).toBe(300n);
    expect(aging.totalMinor).toBe(550n);
    expect(aging.unappliedCreditMinor).toBe(0n);
  });

  it('reports a credit balance as unapplied credit', () => {
    const aging = ageBalance([entry('2026-01-01', 100), entry('2026-01-02', -150, 'payment_received')], '2026-01-10');
    expect(aging.totalMinor).toBe(0n);
    expect(aging.unappliedCreditMinor).toBe(50n);
  });

  it('ignores documents after the as-of date and keeps not-yet-due amounts current', () => {
    const aging = ageBalance([entry('2026-05-01', 100, 'sales_invoice', '2026-06-01'), entry('2026-07-01', 999)], '2026-05-20');
    expect(aging.currentMinor).toBe(100n);
    expect(aging.totalMinor).toBe(100n);
  });
});

describe('date helpers', () => {
  it('counts calendar days and adds days across months', () => {
    expect(daysBetween('2026-01-31', '2026-03-01')).toBe(29);
    expect(addDays('2026-01-31', 30)).toBe('2026-03-02');
    expect(openingBalanceEntry(0n, null)).toBeNull();
  });
});

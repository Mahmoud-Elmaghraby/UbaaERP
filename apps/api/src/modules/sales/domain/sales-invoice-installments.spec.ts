import {
  addMonths,
  applyCollections,
  earliestUnpaidDueDate,
  generateInstallments,
  planSchedule,
} from './sales-invoice-installments';

describe('addMonths', () => {
  it('adds months and clamps to the month end', () => {
    expect(addMonths('2026-01-15', 1)).toBe('2026-02-15');
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2028-01-31', 1)).toBe('2028-02-29');
    expect(addMonths('2026-11-30', 3)).toBe('2027-02-28');
    expect(addMonths('2026-12-05', 12)).toBe('2027-12-05');
  });
});

describe('generateInstallments', () => {
  it('splits equally and gives the rounding rest to the last installment', () => {
    const rows = generateInstallments({ totalMinor: 100_000n, count: 3, firstDueDate: '2026-01-31' });
    expect(rows.map((r) => r.amountMinor)).toEqual([33_333n, 33_333n, 33_334n]);
    expect(rows.map((r) => r.dueDate)).toEqual(['2026-01-31', '2026-02-28', '2026-03-31']);
    expect(rows.map((r) => r.sequence)).toEqual([1, 2, 3]);
  });

  it('puts the down payment first and splits the rest', () => {
    const rows = generateInstallments({
      totalMinor: 120_000n,
      count: 4,
      firstDueDate: '2026-12-01',
      downPaymentMinor: 20_001n,
      downPaymentDate: '2026-11-05',
    });
    expect(rows[0]).toEqual({ sequence: 1, dueDate: '2026-11-05', amountMinor: 20_001n, notes: null });
    expect(rows.slice(1).map((r) => r.amountMinor)).toEqual([24_999n, 24_999n, 24_999n, 25_002n]);
    expect(rows.reduce((s, r) => s + r.amountMinor, 0n)).toBe(120_000n);
    expect(rows.at(-1)!.dueDate).toBe('2027-03-01');
  });

  it('supports a longer interval', () => {
    const rows = generateInstallments({ totalMinor: 900n, count: 3, firstDueDate: '2026-01-10', intervalMonths: 3 });
    expect(rows.map((r) => r.dueDate)).toEqual(['2026-01-10', '2026-04-10', '2026-07-10']);
  });

  it('rejects a down payment that covers the whole total', () => {
    expect(() => generateInstallments({ totalMinor: 1000n, count: 2, firstDueDate: '2026-01-01', downPaymentMinor: 1000n })).toThrow(
      expect.objectContaining({ code: 'SALES_INVOICE_INSTALLMENTS.DOWN_PAYMENT_TOO_LARGE' }),
    );
  });

  it('rejects bad counts and dates', () => {
    expect(() => generateInstallments({ totalMinor: 1000n, count: 0, firstDueDate: '2026-01-01' })).toThrow(
      expect.objectContaining({ code: 'SALES_INVOICE_INSTALLMENTS.INVALID_COUNT' }),
    );
    expect(() => generateInstallments({ totalMinor: 2n, count: 3, firstDueDate: '2026-01-01' })).toThrow(
      expect.objectContaining({ code: 'SALES_INVOICE_INSTALLMENTS.INVALID_COUNT' }),
    );
    expect(() => generateInstallments({ totalMinor: 1000n, count: 2, firstDueDate: '2026-02-30' })).toThrow(
      expect.objectContaining({ code: 'SALES_INVOICE_INSTALLMENTS.INVALID_DATE' }),
    );
  });
});

describe('planSchedule', () => {
  it('orders by due date and numbers the rows', () => {
    const rows = planSchedule(300n, [
      { dueDate: '2026-03-01', amountMinor: 100n },
      { dueDate: '2026-01-01', amountMinor: 150n, notes: '  مقدم ' },
      { dueDate: '2026-02-01', amountMinor: 50n },
    ]);
    expect(rows.map((r) => [r.sequence, r.dueDate, r.amountMinor, r.notes])).toEqual([
      [1, '2026-01-01', 150n, 'مقدم'],
      [2, '2026-02-01', 50n, null],
      [3, '2026-03-01', 100n, null],
    ]);
  });

  it('allows an empty schedule (removes it)', () => {
    expect(planSchedule(300n, [])).toEqual([]);
  });

  it('requires the sum to equal the total', () => {
    expect(() => planSchedule(300n, [{ dueDate: '2026-01-01', amountMinor: 299n }])).toThrow(
      expect.objectContaining({ code: 'SALES_INVOICE_INSTALLMENTS.SUM_MISMATCH' }),
    );
  });

  it('rejects zero amounts', () => {
    expect(() =>
      planSchedule(300n, [
        { dueDate: '2026-01-01', amountMinor: 300n },
        { dueDate: '2026-02-01', amountMinor: 0n },
      ]),
    ).toThrow(expect.objectContaining({ code: 'SALES_INVOICE_INSTALLMENTS.INVALID_AMOUNT' }));
  });
});

describe('applyCollections', () => {
  const schedule = [
    { dueDate: '2026-01-01', amountMinor: 100n },
    { dueDate: '2026-02-01', amountMinor: 100n },
    { dueDate: '2026-03-01', amountMinor: 100n },
  ];

  it('applies collections oldest first', () => {
    const states = applyCollections(schedule, 150n, '2026-01-15');
    expect(states.map((s) => s.status)).toEqual(['paid', 'partially_paid', 'due']);
    expect(states.map((s) => s.paidMinor)).toEqual([100n, 50n, 0n]);
    expect(states.map((s) => s.remainingMinor)).toEqual([0n, 50n, 100n]);
  });

  it('marks unpaid past-due installments overdue with days', () => {
    const states = applyCollections(schedule, 50n, '2026-02-11');
    expect(states.map((s) => s.status)).toEqual(['overdue', 'overdue', 'due']);
    expect(states.map((s) => s.overdueDays)).toEqual([41, 10, 0]);
  });

  it('due today is not overdue', () => {
    expect(applyCollections(schedule, 0n, '2026-01-01')[0]!.status).toBe('due');
  });

  it('everything paid', () => {
    expect(applyCollections(schedule, 300n, '2027-01-01').every((s) => s.status === 'paid')).toBe(true);
  });
});

describe('earliestUnpaidDueDate', () => {
  const schedule = [
    { dueDate: '2026-01-01', amountMinor: 100n },
    { dueDate: '2026-02-01', amountMinor: 100n },
  ];
  it('skips fully covered installments', () => {
    expect(earliestUnpaidDueDate(schedule, 0n)).toBe('2026-01-01');
    expect(earliestUnpaidDueDate(schedule, 100n)).toBe('2026-02-01');
    expect(earliestUnpaidDueDate(schedule, 150n)).toBe('2026-02-01');
    expect(earliestUnpaidDueDate(schedule, 200n)).toBeNull();
  });
});

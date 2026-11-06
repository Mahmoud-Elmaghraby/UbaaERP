import { findQuantityExcess, inLineUnit, toBaseQuantity } from './quantity-limits';

describe('findQuantityExcess', () => {
  const limits = new Map([
    ['po-line-1', 24], // 2 cartons × 12
    ['po-line-2', 10],
  ]);

  it('passes when confirmed + this document stay within the ordered base quantity', () => {
    expect(
      findQuantityExcess([{ sourceLineId: 'po-line-1', quantity: 1, unitFactor: 12 }], limits, { 'po-line-1': 12 }),
    ).toBeNull();
  });

  it('refuses the second draft once the first one used up the line (the over-receive race)', () => {
    const excess = findQuantityExcess([{ sourceLineId: 'po-line-1', quantity: 2, unitFactor: 12 }], limits, {
      'po-line-1': 24,
    });
    expect(excess).toEqual({ sourceLineId: 'po-line-1', requestedBase: 24, limitBase: 24, usedBase: 24, remainingBase: 0 });
  });

  it('compares base units, not raw line quantities (1 carton of 12 is 12, not 1)', () => {
    // Raw quantities would say 1 + 1 ≤ 2; in base units it is 12 + 12 > 20.
    const excess = findQuantityExcess([{ sourceLineId: 'po-line-1', quantity: 1, unitFactor: 12 }], new Map([['po-line-1', 20]]), {
      'po-line-1': 12,
    });
    expect(excess?.remainingBase).toBe(8);
  });

  it('adds up several lines of the same document drawing on one source line', () => {
    const excess = findQuantityExcess(
      [
        { sourceLineId: 'po-line-2', quantity: 6, unitFactor: 1 },
        { sourceLineId: 'po-line-2', quantity: 5, unitFactor: 1 },
      ],
      limits,
      {},
    );
    expect(excess).toMatchObject({ sourceLineId: 'po-line-2', requestedBase: 11, remainingBase: 10 });
  });

  it('tolerates floating-point noise on decimal quantities', () => {
    expect(
      findQuantityExcess([{ sourceLineId: 'l', quantity: 0.2, unitFactor: 1 }], new Map([['l', 0.3]]), { l: 0.1 }),
    ).toBeNull();
  });

  it('treats an unknown source line as nothing left', () => {
    expect(findQuantityExcess([{ sourceLineId: 'x', quantity: 1, unitFactor: 1 }], limits, {})).toMatchObject({
      limitBase: 0,
      remainingBase: 0,
    });
  });
});

describe('base ↔ line unit helpers', () => {
  it('round-trips', () => {
    expect(toBaseQuantity(2.5, 12)).toBe(30);
    expect(inLineUnit(30, 12)).toBe(2.5);
    expect(inLineUnit(5, 0)).toBe(5);
  });
});
